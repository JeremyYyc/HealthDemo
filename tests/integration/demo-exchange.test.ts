import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { createDemoExchangePostRoute } from "../../src/api/routes/demo-exchange.js";
import { createAssessmentResultGetRoute } from "../../src/api/routes/assessment-result.js";
import { DEMO_FIXTURE_IDS } from "../../src/domain/demo-fixtures.js";
import { DemoExchangeService } from "../../src/services/demo-exchange-service.js";
import { AssessmentResultService } from "../../src/services/assessment-result-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests");
const schemaName = `p0_09_${randomUUID().replaceAll("-", "")}`;
const isolatedUrl = new URL(databaseUrl); isolatedUrl.searchParams.set("schema", schemaName);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: isolatedUrl.toString() }, { schema: schemaName }) });
const appBaseUrl = "https://health.example";
const tokenSecret = "p0-09-integration-token-secret-at-least-32-characters";
const credentialsFile = `/tmp/health-demo-p0-09-${randomUUID()}.env`;
const paidAssessmentId = DEMO_FIXTURE_IDS.paid.assessment;
type Credentials = Record<string, string>;
let credentials: Credentials;
let resetOutput = "";

function parseCredentials(text: string): Credentials {
  return Object.fromEntries(text.trim().split("\n").map((line) => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)]; }));
}

function reset(): Credentials {
  resetOutput = execFileSync("npm", ["run", "demo:reset"], {
    cwd: process.cwd(), encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: isolatedUrl.toString(),
      DIRECT_URL: isolatedUrl.toString(),
      SESSION_TOKEN_SECRET: tokenSecret,
      DEMO_CREDENTIALS_FILE: credentialsFile,
    },
  });
  return parseCredentials(readFileSync(credentialsFile, "utf8"));
}

beforeAll(() => {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: isolatedUrl.toString(), DIRECT_URL: isolatedUrl.toString() },
    stdio: "pipe",
  });
  credentials = reset();
});
afterAll(async () => { await prisma.$disconnect(); await unlink(credentialsFile).catch(() => undefined); });

function exchangeRoute(overrides: Partial<ConstructorParameters<typeof DemoExchangeService>[1]> = {}, omitPaidToken = false) {
  const service = new DemoExchangeService(prisma, {
    tokenSecret, secureCookie: false, enabled: true,
    reviewCodeHash: credentials.DEMO_REVIEW_CODE_HASH!,
    ...(omitPaidToken ? {} : { paidSessionToken: credentials.DEMO_PAID_SESSION_TOKEN! }),
    ...overrides,
  });
  return createDemoExchangePostRoute({ appBaseUrl, getService: () => service });
}

function exchange(reviewCode: string, options: { route?: ReturnType<typeof exchangeRoute>; body?: unknown; origin?: string; ip?: string } = {}) {
  return (options.route ?? exchangeRoute())(new Request(`${appBaseUrl}/api/demo/session-exchange`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: options.origin ?? appBaseUrl, "x-forwarded-for": options.ip ?? "203.0.113.10" },
    body: JSON.stringify(options.body ?? { reviewCode }),
  }));
}

async function json(response: Response) { return (await response.json()) as { data?: Record<string, unknown>; error?: { code: string } }; }

describe("P0-09 paid Demo Session exchange and reset", () => {
  it("P0-09-T01 exchanges the correct code for a Cookie that reads the fixed Full result", async () => {
    const response = await exchange(credentials.DEMO_REVIEW_CODE!, { ip: "203.0.113.11" });
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ data: { accessLevel: "FULL", resultUrl: `/api/assessments/${paidAssessmentId}/result` } });
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("SameSite=Lax");
    const results = new AssessmentResultService(prisma, { tokenSecret, secureCookie: false });
    const route = createAssessmentResultGetRoute({ getService: () => results });
    const full = await route(new Request(`${appBaseUrl}/api/assessments/${paidAssessmentId}/result`, { headers: { cookie } }), { params: Promise.resolve({ id: paidAssessmentId }) });
    expect(full.status).toBe(200); expect((await json(full)).data?.accessLevel).toBe("FULL");
  });

  it("P0-09-T02 rejects wrong code, extra IDs, cross-site requests, and the sixth source attempt", async () => {
    for (const [index, code] of ["", "x", "x".repeat(1_000)].entries()) {
      const wrong = await exchange(code, { ip: `203.0.113.${12 + index}` });
      expect(wrong.status).toBe(401); expect((await json(wrong)).error?.code).toBe("INVALID_REVIEW_CODE");
    }
    const extra = await exchange(credentials.DEMO_REVIEW_CODE!, { body: { reviewCode: credentials.DEMO_REVIEW_CODE, sessionId: "anything" }, ip: "203.0.113.13" });
    expect(extra.status).toBe(400); expect((await json(extra)).error?.code).toBe("VALIDATION_ERROR");
    const crossSite = await exchange(credentials.DEMO_REVIEW_CODE!, { origin: "https://evil.example", ip: "203.0.113.14" });
    expect(crossSite.status).toBe(403); expect((await json(crossSite)).error?.code).toBe("FORBIDDEN_ORIGIN");
    const attempts = [];
    for (let index = 0; index < 6; index += 1) attempts.push(await exchange("wrong-review-code", { ip: "203.0.113.15" }));
    expect(attempts.slice(0, 5).every((item) => item.status === 401)).toBe(true);
    expect(attempts[5]?.status).toBe(429); expect(attempts[5]?.headers.get("retry-after")).toMatch(/^\d+$/);
  });

  it("P0-09-T03 returns the same unavailable error for disabled, missing, misdirected, or damaged fixtures", async () => {
    async function expectUnavailable(response: Response) {
      expect(response.status).toBe(503);
      expect((await json(response)).error?.code).toBe("DEMO_EXCHANGE_UNAVAILABLE");
    }
    const disabled = await exchange(credentials.DEMO_REVIEW_CODE!, { route: exchangeRoute({ enabled: false }), ip: "203.0.113.16" });
    const missing = await exchange(credentials.DEMO_REVIEW_CODE!, { route: exchangeRoute({}, true), ip: "203.0.113.17" });
    await expectUnavailable(disabled); await expectUnavailable(missing);

    await prisma.subscription.update({ where: { sessionId: DEMO_FIXTURE_IDS.paid.session }, data: { status: "INACTIVE" } });
    await expectUnavailable(await exchange(credentials.DEMO_REVIEW_CODE!, { ip: "203.0.113.18" }));
    credentials = reset();

    await prisma.payment.update({ where: { id: DEMO_FIXTURE_IDS.paid.payment }, data: { sessionId: DEMO_FIXTURE_IDS.unpaid.session } });
    await expectUnavailable(await exchange(credentials.DEMO_REVIEW_CODE!, { ip: "203.0.113.19" }));
    credentials = reset();

    await prisma.payment.update({ where: { id: DEMO_FIXTURE_IDS.paid.payment }, data: { status: "FAILED" } });
    await expectUnavailable(await exchange(credentials.DEMO_REVIEW_CODE!, { ip: "203.0.113.20" }));
    credentials = reset();

    await prisma.assessment.update({ where: { id: DEMO_FIXTURE_IDS.paid.assessment }, data: { status: "IN_PROGRESS" } });
    await expectUnavailable(await exchange(credentials.DEMO_REVIEW_CODE!, { ip: "203.0.113.21" }));
    credentials = reset();

    await prisma.assessmentResult.delete({ where: { id: DEMO_FIXTURE_IDS.paid.result } });
    await expectUnavailable(await exchange(credentials.DEMO_REVIEW_CODE!, { ip: "203.0.113.22" }));
    credentials = reset();

    await prisma.session.update({ where: { id: DEMO_FIXTURE_IDS.paid.session }, data: { expiresAt: new Date("2000-01-01T00:00:00Z") } });
    await expectUnavailable(await exchange(credentials.DEMO_REVIEW_CODE!, { ip: "203.0.113.23" }));
    credentials = reset();

    const unpaidPaymentId = randomUUID();
    await prisma.payment.create({ data: {
      id: unpaidPaymentId, sessionId: DEMO_FIXTURE_IDS.unpaid.session, assessmentId: DEMO_FIXTURE_IDS.unpaid.assessment,
      status: "SUCCEEDED", provider: "DEMO", idempotencyKey: randomUUID(), requestFingerprint: "misdirected-demo-token",
      transactionId: randomUUID(), paidAt: new Date(),
    } });
    await prisma.subscription.update({ where: { sessionId: DEMO_FIXTURE_IDS.unpaid.session }, data: {
      status: "ACTIVE", activatedAt: new Date(), activationPaymentId: unpaidPaymentId,
    } });
    await expectUnavailable(await exchange(credentials.DEMO_REVIEW_CODE!, {
      route: exchangeRoute({ paidSessionToken: credentials.DEMO_UNPAID_SESSION_TOKEN! }), ip: "203.0.113.24",
    }));
    credentials = reset();
  });

  it("P0-09-T04 never places generated credentials or digests in body, URL, README, or reset output", async () => {
    const response = await exchange(credentials.DEMO_REVIEW_CODE!, { ip: "203.0.113.25" });
    const visible = `${response.url}\n${JSON.stringify(await json(response))}\n${await readFile("README.md", "utf8")}\n${await readFile(".env.example", "utf8")}\n${resetOutput}`;
    for (const secret of [credentials.DEMO_REVIEW_CODE, credentials.DEMO_REVIEW_CODE_HASH, credentials.DEMO_PAID_SESSION_TOKEN]) expect(visible).not.toContain(secret);
    const buckets = await prisma.rateLimitBucket.findMany({ where: { scope: "demo-session-exchange" } });
    expect(buckets.every(({ keyDigest }) => !visible.includes(keyDigest))).toBe(true);
  });

  it("P0-09-T05 repeat reset rotates credentials, invalidates old access, and preserves Full verification", async () => {
    const old = credentials;
    const oldExchange = await exchange(old.DEMO_REVIEW_CODE!, { ip: "203.0.113.26" });
    const oldCookie = oldExchange.headers.get("set-cookie")!;
    const extraAssessmentId = randomUUID();
    await prisma.assessment.create({ data: {
      id: extraAssessmentId, sessionId: DEMO_FIXTURE_IDS.paid.session, status: "COMPLETED", version: 1,
      completedAt: new Date(),
    } });
    await prisma.assessmentResult.create({ data: {
      id: randomUUID(), assessmentId: extraAssessmentId, bmi: 25, bmiCategory: "NORMAL", bmrKcal: 1_500,
      tdeeKcal: 2_000, recommendedCaloriesKcal: 1_700, calculationDate: new Date("2026-08-05T00:00:00Z"),
      estimatedWeeks: 10, predictionCurve: [], calorieFloorApplied: false, algorithmVersion: "pollution-test",
    } });
    await prisma.payment.create({ data: {
      id: randomUUID(), sessionId: DEMO_FIXTURE_IDS.paid.session, assessmentId: extraAssessmentId,
      status: "PENDING", provider: "DEMO", idempotencyKey: randomUUID(), requestFingerprint: "pollution-test",
      transactionId: randomUUID(),
    } });
    await prisma.assessment.create({ data: {
      id: randomUUID(), sessionId: DEMO_FIXTURE_IDS.paid.session, status: "IN_PROGRESS", version: 0,
    } });
    credentials = reset();
    for (const key of ["DEMO_REVIEW_CODE", "DEMO_REVIEW_CODE_HASH", "DEMO_PAID_SESSION_TOKEN"]) expect(credentials[key]).not.toBe(old[key]);
    expect(await prisma.assessment.count({ where: { sessionId: { in: [DEMO_FIXTURE_IDS.paid.session, DEMO_FIXTURE_IDS.unpaid.session] } } })).toBe(2);
    expect(await prisma.assessmentResult.count({ where: { assessmentId: { in: [DEMO_FIXTURE_IDS.paid.assessment, DEMO_FIXTURE_IDS.unpaid.assessment] } } })).toBe(2);
    expect(await prisma.payment.count({ where: { sessionId: DEMO_FIXTURE_IDS.paid.session } })).toBe(1);
    const oldCode = await exchange(old.DEMO_REVIEW_CODE!, { ip: "203.0.113.27" });
    expect(oldCode.status).toBe(401);
    const results = new AssessmentResultService(prisma, { tokenSecret, secureCookie: false });
    const resultRoute = createAssessmentResultGetRoute({ getService: () => results });
    const oldResult = await resultRoute(new Request(`${appBaseUrl}/api/assessments/${paidAssessmentId}/result`, { headers: { cookie: oldCookie } }), { params: Promise.resolve({ id: paidAssessmentId }) });
    expect(oldResult.status).toBe(401);
    const fresh = await exchange(credentials.DEMO_REVIEW_CODE!, { ip: "203.0.113.28" });
    expect(fresh.status).toBe(200);
    const full = await resultRoute(new Request(`${appBaseUrl}/api/assessments/${paidAssessmentId}/result`, { headers: { cookie: fresh.headers.get("set-cookie")! } }), { params: Promise.resolve({ id: paidAssessmentId }) });
    expect(full.status).toBe(200); expect((await json(full)).data?.accessLevel).toBe("FULL");
  });
});
