import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests");
}

const schemaName = `p0_01_${randomUUID().replaceAll("-", "")}`;
const migrationUrl = new URL(databaseUrl);
migrationUrl.searchParams.set("schema", schemaName);
const client = new Client({ connectionString: databaseUrl });

async function createSession(tokenHash = randomUUID()): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO sessions (token_hash, expires_at, updated_at)
     VALUES ($1, CURRENT_TIMESTAMP + INTERVAL '30 days', CURRENT_TIMESTAMP)
     RETURNING id`,
    [tokenHash],
  );
  return result.rows[0]!.id;
}

async function createAssessment(sessionId: string, status = "IN_PROGRESS"): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO assessments (session_id, status, updated_at)
     VALUES ($1, $2::"AssessmentStatus", CURRENT_TIMESTAMP)
     RETURNING id`,
    [sessionId, status],
  );
  return result.rows[0]!.id;
}

beforeAll(async () => {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: migrationUrl.toString() },
    stdio: "pipe",
  });
  await client.connect();
  await client.query(`SET search_path TO "${schemaName}"`);
});

afterAll(async () => {
  await client.end();
});

describe("P0-01 database invariants", () => {
  it("P0-01-T01 deploys the migration and creates all five tables", async () => {
    const result = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [["sessions", "assessments", "assessment_results", "subscriptions", "payments"]],
    );
    expect(result.rows.map(({ table_name }) => table_name)).toEqual([
      "assessment_results",
      "assessments",
      "payments",
      "sessions",
      "subscriptions",
    ]);
  });

  it("P0-01-T02 rejects a second in-progress assessment for a session", async () => {
    const sessionId = await createSession();
    await createAssessment(sessionId);
    await expect(createAssessment(sessionId)).rejects.toMatchObject({ code: "23505" });
    await expect(createAssessment(sessionId, "COMPLETED")).resolves.toBeTypeOf("string");
  });

  it("P0-01-T03 rejects a second subscription and a second successful payment", async () => {
    const sessionId = await createSession();
    const assessmentId = await createAssessment(sessionId, "COMPLETED");
    await client.query(
      `INSERT INTO subscriptions (session_id, updated_at) VALUES ($1, CURRENT_TIMESTAMP)`,
      [sessionId],
    );
    await expect(
      client.query(`INSERT INTO subscriptions (session_id, updated_at) VALUES ($1, CURRENT_TIMESTAMP)`, [sessionId]),
    ).rejects.toMatchObject({ code: "23505" });

    await client.query(
      `INSERT INTO payments
       (session_id, assessment_id, status, idempotency_key, request_fingerprint, transaction_id)
       VALUES ($1, $2, 'SUCCEEDED', 'first-key', $3, $4)`,
      [sessionId, assessmentId, assessmentId, randomUUID()],
    );
    await expect(
      client.query(
        `INSERT INTO payments
         (session_id, assessment_id, status, idempotency_key, request_fingerprint, transaction_id)
         VALUES ($1, $2, 'SUCCEEDED', 'second-key', $3, $4)`,
        [sessionId, assessmentId, assessmentId, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("P0-01-T04 scopes idempotency keys to a session", async () => {
    const firstSession = await createSession();
    const secondSession = await createSession();
    const firstAssessment = await createAssessment(firstSession, "COMPLETED");
    const secondAssessment = await createAssessment(secondSession, "COMPLETED");
    const sharedKey = "shared-idempotency-key";

    await client.query(
      `INSERT INTO payments
       (session_id, assessment_id, status, idempotency_key, request_fingerprint, transaction_id)
       VALUES ($1, $2, 'FAILED', $3, $4, $5)`,
      [firstSession, firstAssessment, sharedKey, firstAssessment, randomUUID()],
    );
    await client.query(
      `INSERT INTO payments
       (session_id, assessment_id, status, idempotency_key, request_fingerprint, transaction_id)
       VALUES ($1, $2, 'FAILED', $3, $4, $5)`,
      [secondSession, secondAssessment, sharedKey, secondAssessment, randomUUID()],
    );
    const firstLookup = await client.query<{ session_id: string }>(
      `SELECT session_id FROM payments WHERE session_id = $1 AND idempotency_key = $2`,
      [firstSession, sharedKey],
    );
    expect(firstLookup.rows).toEqual([{ session_id: firstSession }]);
  });

  it("P0-01-T05 keeps historical result snapshots across forward deploys", async () => {
    const sessionId = await createSession();
    const assessmentId = await createAssessment(sessionId, "COMPLETED");
    await client.query(
      `INSERT INTO assessment_results
       (assessment_id, bmi, bmi_category, bmr_kcal, tdee_kcal, recommended_calories_kcal,
        calculation_date, estimated_weeks, prediction_curve, calorie_floor_applied, algorithm_version)
       VALUES ($1, 24.0, 'HEALTHY', 1500, 2200, 1800, DATE '2025-01-01', 10, '[]', false, 'legacy-v0')`,
      [assessmentId],
    );

    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: migrationUrl.toString() },
      stdio: "pipe",
    });
    const snapshot = await client.query<{ algorithm_version: string; bmi: string }>(
      `SELECT algorithm_version, bmi::text FROM assessment_results WHERE assessment_id = $1`,
      [assessmentId],
    );
    expect(snapshot.rows).toEqual([{ algorithm_version: "legacy-v0", bmi: "24.0" }]);
  });
});
