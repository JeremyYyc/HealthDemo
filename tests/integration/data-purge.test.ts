import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { DataPurgeService } from "../../src/services/data-purge-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests");
const schemaName = `p0_11_${randomUUID().replaceAll("-", "")}`;
const isolatedUrl = new URL(databaseUrl); isolatedUrl.searchParams.set("schema", schemaName);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: isolatedUrl.toString() }, { schema: schemaName }) });
const service = new DataPurgeService(prisma);
const calculationTime = new Date("2026-08-05T12:00:00.000Z");
const cutoffTime = new Date("2026-07-29T12:00:00.000Z");

beforeAll(() => execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: isolatedUrl.toString() }, stdio: "pipe" }));
beforeEach(async () => {
  await prisma.subscription.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.assessmentResult.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.session.deleteMany();
});
afterAll(async () => { await prisma.$disconnect(); });

async function createSession(expiresAt: Date, withRelations = false) {
  const sessionId = randomUUID();
  const assessmentId = randomUUID();
  const paymentId = randomUUID();
  await prisma.session.create({ data: {
    id: sessionId, tokenHash: randomUUID(), createdAt: new Date(expiresAt.getTime() - 30 * 24 * 60 * 60 * 1_000), expiresAt,
  } });
  if (!withRelations) return { sessionId, assessmentId, paymentId };
  await prisma.assessment.create({ data: {
    id: assessmentId, sessionId, status: "COMPLETED", version: 8, completedAt: new Date("2026-06-01T00:00:00.000Z"),
  } });
  await prisma.assessmentResult.create({ data: {
    id: randomUUID(), assessmentId, bmi: 25, bmiCategory: "NORMAL", bmrKcal: 1_500, tdeeKcal: 2_000,
    recommendedCaloriesKcal: 1_700, calculationDate: new Date("2026-06-01T00:00:00.000Z"), estimatedWeeks: 10,
    predictionCurve: [], calorieFloorApplied: false, algorithmVersion: "purge-test",
  } });
  await prisma.payment.create({ data: {
    id: paymentId, sessionId, assessmentId, status: "SUCCEEDED", provider: "DEMO", idempotencyKey: randomUUID(),
    requestFingerprint: assessmentId, transactionId: randomUUID(), paidAt: new Date("2026-06-01T00:00:00.000Z"),
  } });
  await prisma.subscription.create({ data: {
    id: randomUUID(), sessionId, status: "ACTIVE", activatedAt: new Date("2026-06-01T00:00:00.000Z"), activationPaymentId: paymentId,
  } });
  return { sessionId, assessmentId, paymentId };
}

async function counts() {
  const [sessions, assessments, results, payments, subscriptions] = await Promise.all([
    prisma.session.count(), prisma.assessment.count(), prisma.assessmentResult.count(), prisma.payment.count(), prisma.subscription.count(),
  ]);
  return { sessions, assessments, results, payments, subscriptions };
}

function runPurgeCommand(args: string[]) {
  const output = execFileSync("npm", ["run", "data:purge-expired", "--", ...args], {
    cwd: process.cwd(), encoding: "utf8", env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
  });
  const auditLine = output.trim().split("\n").reverse().find((line) => line.startsWith("{"));
  if (!auditLine) throw new Error("Purge command did not emit an audit summary");
  return { output, summary: JSON.parse(auditLine) as Awaited<ReturnType<DataPurgeService["purge"]>> };
}

describe("P0-11 30+7 day data retention purge", () => {
  it("P0-11-T01 dry-run reports candidates without changing the database", async () => {
    const fixture = await createSession(new Date("2026-07-20T00:00:00.000Z"), true);
    await createSession(new Date("2026-08-05T12:00:00.000Z"), true);
    const before = await counts();
    const { output, summary } = runPurgeCommand([`--calculation-time=${calculationTime.toISOString()}`]);
    expect(summary).toMatchObject({
      version: "data-purge/v1", mode: "dry-run", calculationTime: calculationTime.toISOString(), cutoffTime: cutoffTime.toISOString(), outcome: "SUCCEEDED",
      candidates: { sessions: 1, assessments: 1, results: 1, payments: 1, subscriptions: 1 },
      deleted: { sessions: 0, assessments: 0, results: 0, payments: 0, subscriptions: 0 },
    });
    expect(output).not.toContain(fixture.sessionId);
    expect(output).not.toContain(fixture.assessmentId);
    expect(output).not.toContain("tokenHash");
    expect(output).not.toContain("bmi");
    expect(await counts()).toEqual(before);
  });

  it("P0-11-T02 applies the 30-day expiry plus inclusive 7-day retention boundary", async () => {
    const atBoundary = await createSession(cutoffTime);
    const oneMillisecondInsideRetention = await createSession(new Date(cutoffTime.getTime() + 1));
    const thirtyDaysOld = await createSession(calculationTime);
    const summary = await service.purge("dry-run", calculationTime);
    expect(summary.candidates.sessions).toBe(1);
    expect((await prisma.session.findUnique({ where: { id: atBoundary.sessionId } }))?.expiresAt).toEqual(cutoffTime);
    expect(await prisma.session.findUnique({ where: { id: oneMillisecondInsideRetention.sessionId } })).not.toBeNull();
    expect(await prisma.session.findUnique({ where: { id: thirtyDaysOld.sessionId } })).not.toBeNull();
  });

  it("P0-11-T03 execute removes every related entity in explicit foreign-key order", async () => {
    await createSession(new Date("2026-07-20T00:00:00.000Z"), true);
    const { summary } = runPurgeCommand([
      `--calculation-time=${calculationTime.toISOString()}`, "--execute", "--confirm=PURGE_EXPIRED_DATA",
    ]);
    expect(summary.deleted).toEqual({ sessions: 1, assessments: 1, results: 1, payments: 1, subscriptions: 1 });
    expect(await counts()).toEqual({ sessions: 0, assessments: 0, results: 0, payments: 0, subscriptions: 0 });
  });

  it("P0-11-T04 keeps unexpired and within-retention Sessions and all of their relations", async () => {
    await createSession(new Date("2026-08-10T00:00:00.000Z"), true);
    await createSession(new Date("2026-08-01T00:00:00.000Z"), true);
    const before = await counts();
    const summary = await service.purge("execute", calculationTime);
    expect(summary.candidates.sessions).toBe(0);
    expect(await counts()).toEqual(before);
  });

  it("P0-11-T05 rolls back a failed transaction and repeated successful execute is idempotent", async () => {
    const fixture = await createSession(new Date("2026-07-20T00:00:00.000Z"), true);
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${schemaName}".fail_purge_session_delete() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'forced purge failure'; END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_purge_session_delete BEFORE DELETE ON "${schemaName}".sessions
      FOR EACH ROW EXECUTE FUNCTION "${schemaName}".fail_purge_session_delete()
    `);
    try {
      await expect(service.purge("execute", calculationTime)).rejects.toThrow();
      expect(await counts()).toEqual({ sessions: 1, assessments: 1, results: 1, payments: 1, subscriptions: 1 });
      expect((await prisma.subscription.findUnique({ where: { sessionId: fixture.sessionId } }))?.activationPaymentId).toBe(fixture.paymentId);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_purge_session_delete ON "${schemaName}".sessions`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${schemaName}".fail_purge_session_delete()`);
    }
    expect((await service.purge("execute", calculationTime)).deleted.sessions).toBe(1);
    expect((await service.purge("execute", calculationTime)).deleted).toEqual({ sessions: 0, assessments: 0, results: 0, payments: 0, subscriptions: 0 });
  });
});
