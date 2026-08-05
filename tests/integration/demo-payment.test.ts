import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { createDemoPaymentPostRoute } from "../../src/api/routes/demo-payment.js";
import { createSessionsPostRoute } from "../../src/api/routes/sessions.js";
import { AssessmentResultService } from "../../src/services/assessment-result-service.js";
import { DemoPaymentService, type PaymentAuditEntry } from "../../src/services/demo-payment-service.js";
import { SessionService } from "../../src/services/session-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests");
const schemaName = `p0_08_${randomUUID().replaceAll("-", "")}`;
const isolatedUrl = new URL(databaseUrl); isolatedUrl.searchParams.set("schema", schemaName);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: isolatedUrl.toString() }, { schema: schemaName }) });
const appBaseUrl = "https://health.example";
const tokenSecret = "p0-08-integration-token-secret-at-least-32-characters";
const fixedNow = new Date("2026-08-05T12:00:00.000Z");

beforeAll(() =>
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: isolatedUrl.toString(), DIRECT_URL: isolatedUrl.toString() },
    stdio: "pipe",
  }),
);
afterAll(async () => prisma.$disconnect());

async function addResult(assessmentId: string) {
  await prisma.assessmentResult.create({ data: {
    assessmentId, bmi: 27.7, bmiCategory: "OVERWEIGHT", bmrKcal: 1527, tdeeKcal: 2366,
    recommendedCaloriesKcal: 1866, targetDate: new Date("2026-12-23T00:00:00Z"),
    calculationDate: new Date("2026-08-05T00:00:00Z"), estimatedWeeks: 20,
    predictionCurve: [{ week: 0, date: "2026-08-05", weightKg: 80 }],
    calorieFloorApplied: false, algorithmVersion: "v1",
  } });
}

async function setup(options: { completed?: boolean; second?: boolean } = { completed: true }) {
  const token = `pay-token-${randomUUID()}`;
  const sessions = new SessionService(prisma, { tokenSecret, secureCookie: false, now: () => fixedNow, createToken: () => token });
  const post = createSessionsPostRoute({ appBaseUrl, getService: () => sessions });
  const created = await post(new Request(`${appBaseUrl}/api/sessions`, { method: "POST", headers: { "content-type": "application/json", origin: appBaseUrl }, body: JSON.stringify({ ageRange: "30_39" }) }));
  const data = ((await created.json()) as { data: { sessionId: string; assessment: { id: string } } }).data;
  const cookie = created.headers.get("set-cookie")!.split(";", 1)[0]!;
  let secondAssessmentId: string | undefined;
  if (options.completed !== false) {
    await prisma.assessment.update({ where: { id: data.assessment.id }, data: { status: "COMPLETED", completedAt: fixedNow } });
    await addResult(data.assessment.id);
    if (options.second) {
      const second = await prisma.assessment.create({ data: { sessionId: data.sessionId, status: "COMPLETED", completedAt: fixedNow } });
      secondAssessmentId = second.id; await addResult(second.id);
    }
  }
  return { ...data, cookie, secondAssessmentId };
}

function route(options: ConstructorParameters<typeof DemoPaymentService>[1] = { tokenSecret, secureCookie: false, now: () => fixedNow }) {
  const service = new DemoPaymentService(prisma, options);
  return createDemoPaymentPostRoute({ appBaseUrl, getService: () => service });
}

function pay(cookie: string | null, assessmentId: string, idempotencyKey: string, post = route(), origin = appBaseUrl) {
  return post(new Request(`${appBaseUrl}/api/pay`, { method: "POST", headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ assessmentId, idempotencyKey }) }));
}

async function payload(response: Response) { return (await response.json()) as { data?: Record<string, unknown>; error?: { code: string } }; }

describe("P0-08 Demo payment", () => {
  it("P0-08-T01 activates Session entitlement and unlocks all completed results", async () => {
    const context = await setup({ completed: true, second: true });
    const audits: PaymentAuditEntry[] = [];
    const response = await pay(context.cookie, context.assessment.id, "shared-key-0001", route({ tokenSecret, secureCookie: false, now: () => fixedNow, audit: (entry) => audits.push(entry) }));
    expect(response.status).toBe(200);
    const paid = (await payload(response)).data!;
    expect(paid).toMatchObject({ paymentCreated: true, subscriptionStatus: "ACTIVE", activatedAt: fixedNow.toISOString() });
    expect(await prisma.subscription.findUniqueOrThrow({ where: { sessionId: context.sessionId } })).toMatchObject({ status: "ACTIVE", activationPaymentId: paid.paymentId });
    const results = new AssessmentResultService(prisma, { tokenSecret, secureCookie: false, now: () => fixedNow });
    for (const id of [context.assessment.id, context.secondAssessmentId!]) {
      expect((await results.get(new Request(`${appBaseUrl}/result`, { headers: { cookie: context.cookie } }), id)).accessLevel).toBe("FULL");
    }
    expect(audits).toEqual([{ paymentId: paid.paymentId, requestId: expect.stringMatching(/^req_/), status: "ACTIVE" }]);
  });

  it("P0-08-T02 replays the same fingerprint and rejects key reuse for another Assessment", async () => {
    const context = await setup({ completed: true, second: true });
    const first = (await payload(await pay(context.cookie, context.assessment.id, "replay-key-0001"))).data!;
    const replay = (await payload(await pay(context.cookie, context.assessment.id, "replay-key-0001"))).data!;
    expect(replay).toEqual(first); expect(replay.paymentCreated).toBe(true);
    const conflict = await pay(context.cookie, context.secondAssessmentId!, "replay-key-0001");
    expect(conflict.status).toBe(409); expect((await payload(conflict)).error?.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await prisma.payment.count({ where: { sessionId: context.sessionId } })).toBe(1);
  });

  it("P0-08-T03 serializes different first-payment keys into one Payment", async () => {
    const context = await setup();
    const responses = await Promise.all([pay(context.cookie, context.assessment.id, "parallel-key-01"), pay(context.cookie, context.assessment.id, "parallel-key-02")]);
    expect(responses.map((item) => item.status)).toEqual([200, 200]);
    const bodies = await Promise.all(responses.map(payload));
    expect(bodies.map((item) => item.data?.paymentCreated).sort()).toEqual([false, true]);
    expect(new Set(bodies.map((item) => item.data?.paymentId)).size).toBe(1);
    expect(await prisma.payment.count({ where: { sessionId: context.sessionId, status: "SUCCEEDED" } })).toBe(1);
  });

  it("P0-08-T04 treats every new key after ACTIVE as a no-op without reserving it", async () => {
    const context = await setup();
    const first = (await payload(await pay(context.cookie, context.assessment.id, "active-key-0001"))).data!;
    const noOp = (await payload(await pay(context.cookie, context.assessment.id, "active-key-0002"))).data!;
    expect(noOp).toEqual({ ...first, paymentCreated: false });
    expect(await prisma.payment.count({ where: { sessionId: context.sessionId } })).toBe(1);
  });

  it("P0-08-T05 scopes identical text keys to each Session without leaking Payment IDs", async () => {
    const first = await setup(); const second = await setup();
    const [a, b] = await Promise.all([pay(first.cookie, first.assessment.id, "same-text-key"), pay(second.cookie, second.assessment.id, "same-text-key")]);
    const [ap, bp] = [(await payload(a)).data!, (await payload(b)).data!];
    expect(ap.paymentId).not.toBe(bp.paymentId);
    expect(await prisma.payment.count({ where: { idempotencyKey: "same-text-key" } })).toBe(2);
  });

  it("P0-08-T06 rolls back a write failure and safely retries the same key", async () => {
    const context = await setup();
    const failed = await pay(context.cookie, context.assessment.id, "retry-key-0001", route({ tokenSecret, secureCookie: false, now: () => fixedNow, afterPaymentCreated: () => { throw new Error("injected activation failure"); } }));
    expect(failed.status).toBe(500);
    expect(await prisma.payment.count({ where: { sessionId: context.sessionId } })).toBe(0);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { sessionId: context.sessionId } })).status).toBe("INACTIVE");
    expect((await pay(context.cookie, context.assessment.id, "retry-key-0001")).status).toBe(200);
    expect(await prisma.payment.count({ where: { sessionId: context.sessionId } })).toBe(1);
  });

  it("P0-08-T07 enforces Session, ownership, completion, Origin, schema, and shared limits", async () => {
    const completed = await setup(); const other = await setup(); const unfinished = await setup({ completed: false });
    const noSession = await pay(null, completed.assessment.id, "guard-key-0001");
    expect(noSession.status).toBe(401); expect((await payload(noSession)).error?.code).toBe("SESSION_REQUIRED");
    const foreign = await pay(other.cookie, completed.assessment.id, "guard-key-0002");
    expect(foreign.status).toBe(404); expect((await payload(foreign)).error?.code).toBe("RESOURCE_NOT_FOUND");
    const early = await pay(unfinished.cookie, unfinished.assessment.id, "guard-key-0003");
    expect(early.status).toBe(409); expect((await payload(early)).error?.code).toBe("ASSESSMENT_NOT_COMPLETED");
    const origin = await pay(completed.cookie, completed.assessment.id, "guard-key-0004", route(), "https://evil.example");
    expect(origin.status).toBe(403); expect((await payload(origin)).error?.code).toBe("FORBIDDEN_ORIGIN");
    const limited = await setup();
    const attempts = [];
    for (let index = 0; index < 11; index += 1) attempts.push(await pay(limited.cookie, limited.assessment.id, `limit-key-${String(index).padStart(3, "0")}`));
    expect(attempts.slice(0, 10).every((item) => item.status === 200)).toBe(true);
    expect(attempts[10]?.status).toBe(429); expect(attempts[10]?.headers.get("retry-after")).toMatch(/^\d+$/);
  });
});
