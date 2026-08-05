import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

async function createPayment(
  sessionId: string,
  assessmentId: string,
  status: "FAILED" | "SUCCEEDED",
  idempotencyKey: string,
): Promise<void> {
  await client.query(
     `INSERT INTO payments
     (session_id, assessment_id, status, idempotency_key, request_fingerprint, transaction_id, paid_at)
     VALUES ($1, $2, $3::"PaymentStatus", $4, $5, $6,
             CASE WHEN $3::text = 'SUCCEEDED' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
    [sessionId, assessmentId, status, idempotencyKey, assessmentId, randomUUID()],
  );
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
  it("P0-01-T01 deploys an ER-equivalent catalog with frozen enums and constraints", async () => {
    const tables = ["sessions", "assessments", "assessment_results", "subscriptions", "payments"];
    const columns = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      required: boolean;
    }>(
      `SELECT c.relname AS table_name,
              a.attname AS column_name,
              format_type(a.atttypid, a.atttypmod) AS data_type,
              a.attnotnull AS required
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname = ANY($2::text[])
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY c.relname, a.attname`,
      [schemaName, tables],
    );
    const signatures = columns.rows.map(
      ({ table_name, column_name, data_type, required }) =>
        `${table_name}.${column_name}:${data_type}:${required ? "required" : "nullable"}`,
    );
    expect(signatures).toEqual(
      [
        "assessment_results.algorithm_version:character varying(32):required",
        "assessment_results.assessment_id:uuid:required",
        "assessment_results.bmi:numeric(4,1):required",
        'assessment_results.bmi_category:"BmiCategory":required',
        "assessment_results.bmr_kcal:integer:required",
        "assessment_results.calculation_date:date:required",
        "assessment_results.calorie_floor_applied:boolean:required",
        "assessment_results.created_at:timestamp(3) with time zone:required",
        "assessment_results.estimated_weeks:integer:required",
        "assessment_results.id:uuid:required",
        "assessment_results.prediction_curve:jsonb:required",
        "assessment_results.recommended_calories_kcal:integer:required",
        "assessment_results.target_date:date:nullable",
        "assessment_results.tdee_kcal:integer:required",
        'assessments.activity_level:"ActivityLevel":nullable',
        "assessments.age:integer:nullable",
        'assessments.age_range:"AgeRange":nullable',
        "assessments.completed_at:timestamp(3) with time zone:nullable",
        "assessments.created_at:timestamp(3) with time zone:required",
        'assessments.goal:"Goal":nullable',
        "assessments.height_cm:numeric(5,1):nullable",
        "assessments.id:uuid:required",
        "assessments.session_id:uuid:required",
        'assessments.sex:"Sex":nullable',
        'assessments.status:"AssessmentStatus":required',
        "assessments.target_weight_kg:numeric(5,1):nullable",
        "assessments.updated_at:timestamp(3) with time zone:required",
        "assessments.version:integer:required",
        "assessments.weight_kg:numeric(5,1):nullable",
        "payments.assessment_id:uuid:required",
        "payments.created_at:timestamp(3) with time zone:required",
        "payments.id:uuid:required",
        "payments.idempotency_key:character varying(128):required",
        "payments.paid_at:timestamp(3) with time zone:nullable",
        'payments.provider:"PaymentProvider":required',
        "payments.request_fingerprint:character varying(128):required",
        "payments.session_id:uuid:required",
        'payments.status:"PaymentStatus":required',
        "payments.transaction_id:character varying(128):required",
        "sessions.created_at:timestamp(3) with time zone:required",
        "sessions.expires_at:timestamp(3) with time zone:required",
        "sessions.id:uuid:required",
        "sessions.last_seen_at:timestamp(3) with time zone:nullable",
        "sessions.token_hash:character varying(128):required",
        "sessions.updated_at:timestamp(3) with time zone:required",
        "subscriptions.activated_at:timestamp(3) with time zone:nullable",
        "subscriptions.activation_payment_id:uuid:nullable",
        "subscriptions.expires_at:timestamp(3) with time zone:nullable",
        "subscriptions.id:uuid:required",
        "subscriptions.session_id:uuid:required",
        'subscriptions.status:"SubscriptionStatus":required',
        "subscriptions.updated_at:timestamp(3) with time zone:required",
      ].sort(),
    );

    const defaults = await client.query<{ key: string; column_default: string }>(
      `SELECT table_name || '.' || column_name AS key, column_default
         FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = ANY($2::text[])
          AND column_default IS NOT NULL
        ORDER BY key`,
      [schemaName, tables],
    );
    expect(defaults.rows.map(({ key }) => key)).toEqual([
      "assessment_results.created_at",
      "assessment_results.id",
      "assessments.created_at",
      "assessments.id",
      "assessments.status",
      "assessments.version",
      "payments.created_at",
      "payments.id",
      "payments.provider",
      "sessions.created_at",
      "sessions.expires_at",
      "sessions.id",
      "subscriptions.id",
      "subscriptions.status",
    ]);
    expect(defaults.rows.find(({ key }) => key === "assessments.status")?.column_default).toContain("IN_PROGRESS");
    expect(defaults.rows.find(({ key }) => key === "subscriptions.status")?.column_default).toContain("INACTIVE");
    expect(defaults.rows.find(({ key }) => key === "sessions.expires_at")?.column_default).toContain("30 days");
    expect(defaults.rows.filter(({ key }) => key.endsWith(".id")).every(({ column_default }) => column_default.includes("gen_random_uuid"))).toBe(true);

    const enums = await client.query<{ enum_name: string; labels: string[] }>(
      `SELECT t.typname AS enum_name, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS labels
         FROM pg_type t
         JOIN pg_enum e ON e.enumtypid = t.oid
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = $1
        GROUP BY t.typname
        ORDER BY t.typname`,
      [schemaName],
    );
    expect(Object.fromEntries(enums.rows.map(({ enum_name, labels }) => [enum_name, labels]))).toEqual({
      ActivityLevel: ["SEDENTARY", "LIGHT", "MODERATE", "ACTIVE", "VERY_ACTIVE"],
      AgeRange: ["18_29", "30_39", "40_49", "50_100"],
      AssessmentStatus: ["IN_PROGRESS", "COMPLETED"],
      BmiCategory: ["UNDERWEIGHT", "NORMAL", "OVERWEIGHT", "OBESITY"],
      Goal: ["LOSE_WEIGHT", "MAINTAIN_WEIGHT", "GAIN_WEIGHT"],
      PaymentProvider: ["DEMO"],
      PaymentStatus: ["PENDING", "SUCCEEDED", "FAILED"],
      Sex: ["FEMALE", "MALE"],
      SubscriptionStatus: ["INACTIVE", "ACTIVE", "EXPIRED"],
    });

    const indexes = await client.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = $1 AND tablename = ANY($2::text[])
        ORDER BY indexname`,
      [schemaName, tables],
    );
    const indexDefinitions = Object.fromEntries(indexes.rows.map(({ indexname, indexdef }) => [indexname, indexdef]));
    expect(Object.keys(indexDefinitions)).toEqual([
      "assessment_results_assessment_id_key",
      "assessment_results_pkey",
      "assessments_one_in_progress_per_session",
      "assessments_pkey",
      "assessments_session_id_status_idx",
      "payments_assessment_id_idx",
      "payments_one_succeeded_per_session",
      "payments_pkey",
      "payments_session_id_idempotency_key_key",
      "payments_transaction_id_key",
      "sessions_pkey",
      "sessions_token_hash_key",
      "subscriptions_activation_payment_id_key",
      "subscriptions_pkey",
      "subscriptions_session_id_key",
    ]);
    expect(indexDefinitions.assessments_one_in_progress_per_session).toContain("UNIQUE");
    expect(indexDefinitions.assessments_one_in_progress_per_session).toContain("IN_PROGRESS");
    expect(indexDefinitions.payments_one_succeeded_per_session).toContain("UNIQUE");
    expect(indexDefinitions.payments_one_succeeded_per_session).toContain("SUCCEEDED");
    expect(indexDefinitions.payments_session_id_idempotency_key_key).toContain("session_id, idempotency_key");

    const foreignKeys = await client.query<{ constraint_name: string; delete_action: string }>(
      `SELECT con.conname AS constraint_name, con.confdeltype AS delete_action
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = $1 AND con.contype = 'f'
        ORDER BY con.conname`,
      [schemaName],
    );
    expect(foreignKeys.rows).toEqual([
      { constraint_name: "assessment_results_assessment_id_fkey", delete_action: "r" },
      { constraint_name: "assessments_session_id_fkey", delete_action: "r" },
      { constraint_name: "payments_assessment_id_fkey", delete_action: "r" },
      { constraint_name: "payments_session_id_fkey", delete_action: "r" },
      { constraint_name: "subscriptions_activation_payment_id_fkey", delete_action: "r" },
      { constraint_name: "subscriptions_session_id_fkey", delete_action: "r" },
    ]);
  });

  it("P0-01-T02 enforces one in-progress assessment per Session without becoming global", async () => {
    const firstSession = await createSession();
    const secondSession = await createSession();
    await createAssessment(firstSession);
    await expect(createAssessment(firstSession)).rejects.toMatchObject({
      code: "23505",
      constraint: "assessments_one_in_progress_per_session",
    });
    await expect(createAssessment(firstSession, "COMPLETED")).resolves.toBeTypeOf("string");
    await expect(createAssessment(secondSession)).resolves.toBeTypeOf("string");
  });

  it("P0-01-T03 scopes Subscription and succeeded-payment uniqueness to one Session and predicate", async () => {
    const firstSession = await createSession();
    const firstAssessment = await createAssessment(firstSession, "COMPLETED");
    await client.query(
      `INSERT INTO subscriptions (session_id, updated_at) VALUES ($1, CURRENT_TIMESTAMP)`,
      [firstSession],
    );
    await expect(
      client.query(`INSERT INTO subscriptions (session_id, updated_at) VALUES ($1, CURRENT_TIMESTAMP)`, [firstSession]),
    ).rejects.toMatchObject({ code: "23505", constraint: "subscriptions_session_id_key" });

    await createPayment(firstSession, firstAssessment, "SUCCEEDED", "first-key");
    await expect(createPayment(firstSession, firstAssessment, "SUCCEEDED", "second-key")).rejects.toMatchObject({
      code: "23505",
      constraint: "payments_one_succeeded_per_session",
    });
    await expect(createPayment(firstSession, firstAssessment, "FAILED", "failed-key-1")).resolves.toBeUndefined();
    await expect(createPayment(firstSession, firstAssessment, "FAILED", "failed-key-2")).resolves.toBeUndefined();

    const secondSession = await createSession();
    const secondAssessment = await createAssessment(secondSession, "COMPLETED");
    await expect(createPayment(secondSession, secondAssessment, "SUCCEEDED", "first-key")).resolves.toBeUndefined();
  });

  it("P0-01-T04 enforces Session-scoped idempotency without cross-Session leakage", async () => {
    const firstSession = await createSession();
    const secondSession = await createSession();
    const firstAssessment = await createAssessment(firstSession, "COMPLETED");
    const secondAssessment = await createAssessment(secondSession, "COMPLETED");
    const sharedKey = "shared-idempotency-key";

    await createPayment(firstSession, firstAssessment, "FAILED", sharedKey);
    await expect(createPayment(firstSession, firstAssessment, "FAILED", sharedKey)).rejects.toMatchObject({
      code: "23505",
      constraint: "payments_session_id_idempotency_key_key",
    });
    await expect(createPayment(secondSession, secondAssessment, "FAILED", sharedKey)).resolves.toBeUndefined();

    const firstLookup = await client.query<{ session_id: string }>(
      `SELECT session_id FROM payments WHERE session_id = $1 AND idempotency_key = $2`,
      [firstSession, sharedKey],
    );
    expect(firstLookup.rows).toEqual([{ session_id: firstSession }]);
  });

  it("P0-01-T05 applies a real forward migration and preserves the complete legacy snapshot", async () => {
    const legacySchema = `p0_01_legacy_${randomUUID().replaceAll("-", "")}`;
    const legacyUrl = new URL(databaseUrl);
    legacyUrl.searchParams.set("schema", legacySchema);
    const legacyClient = new Client({ connectionString: databaseUrl });
    const baselineSql = readFileSync(
      new URL("../../prisma/migrations/20260805000000_baseline_schema/migration.sql", import.meta.url),
      "utf8",
    );

    await legacyClient.connect();
    try {
      await legacyClient.query(`CREATE SCHEMA "${legacySchema}"`);
      await legacyClient.query(`SET search_path TO "${legacySchema}"`);
      await legacyClient.query(baselineSql);
      execFileSync(
        "npx",
        ["prisma", "migrate", "resolve", "--applied", "20260805000000_baseline_schema"],
        { env: { ...process.env, DATABASE_URL: legacyUrl.toString() }, stdio: "pipe" },
      );

      const session = await legacyClient.query<{ id: string }>(
        `INSERT INTO sessions (token_hash, expires_at, updated_at)
         VALUES ('legacy-token-hash', TIMESTAMPTZ '2025-02-01T00:00:00Z', TIMESTAMPTZ '2025-01-01T00:00:00Z')
         RETURNING id`,
      );
      const assessment = await legacyClient.query<{ id: string }>(
        `INSERT INTO assessments (session_id, status, completed_at, updated_at)
         VALUES ($1, 'COMPLETED', TIMESTAMPTZ '2025-01-01T00:00:00Z', TIMESTAMPTZ '2025-01-01T00:00:00Z')
         RETURNING id`,
        [session.rows[0]!.id],
      );
      await legacyClient.query(
        `INSERT INTO assessment_results
         (assessment_id, bmi, bmi_category, bmr_kcal, tdee_kcal, recommended_calories_kcal,
          target_date, calculation_date, estimated_weeks, prediction_curve,
          calorie_floor_applied, algorithm_version, created_at)
         VALUES ($1, 24.0, 'NORMAL', 1500, 2200, 1800, DATE '2025-03-12', DATE '2025-01-01',
                 10, '[{"week":0,"date":"2025-01-01","weightKg":80.0}]', false, 'legacy-v0',
                 TIMESTAMPTZ '2025-01-01T00:00:00Z')`,
        [assessment.rows[0]!.id],
      );

      const before = await legacyClient.query(
        `SELECT assessment_id::text, bmi::text, bmi_category::text, bmr_kcal, tdee_kcal,
                recommended_calories_kcal, target_date::text, calculation_date::text,
                estimated_weeks, prediction_curve, calorie_floor_applied, algorithm_version,
                created_at::text
           FROM assessment_results WHERE assessment_id = $1`,
        [assessment.rows[0]!.id],
      );
      const indexesBefore = await legacyClient.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname = $2`,
        [legacySchema, "assessments_one_in_progress_per_session"],
      );
      expect(indexesBefore.rowCount).toBe(0);

      execFileSync("npx", ["prisma", "migrate", "deploy"], {
        env: { ...process.env, DATABASE_URL: legacyUrl.toString() },
        stdio: "pipe",
      });

      const applied = await legacyClient.query<{ migration_name: string }>(
        `SELECT migration_name FROM _prisma_migrations
          WHERE finished_at IS NOT NULL ORDER BY migration_name`,
      );
      expect(applied.rows).toEqual([
        { migration_name: "20260805000000_baseline_schema" },
        { migration_name: "20260805000100_database_invariants" },
      ]);
      const after = await legacyClient.query(
        `SELECT assessment_id::text, bmi::text, bmi_category::text, bmr_kcal, tdee_kcal,
                recommended_calories_kcal, target_date::text, calculation_date::text,
                estimated_weeks, prediction_curve, calorie_floor_applied, algorithm_version,
                created_at::text
           FROM assessment_results WHERE assessment_id = $1`,
        [assessment.rows[0]!.id],
      );
      expect(after.rows).toEqual(before.rows);
    } finally {
      await legacyClient.end();
    }
  });
});
