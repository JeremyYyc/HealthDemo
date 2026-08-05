import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { createAssessmentCompletionPostRoute } from "../../src/api/routes/assessment-completion.js";
import { createAssessmentResultGetRoute } from "../../src/api/routes/assessment-result.js";
import { createSessionsPostRoute } from "../../src/api/routes/sessions.js";
import type { SafeLogEntry } from "../../src/api/http.js";
import { RESULT_DISCLAIMER, UNLOCKABLE_SECTIONS } from "../../src/domain/assessment-result.js";
import { AssessmentCompletionService } from "../../src/services/assessment-completion-service.js";
import { AssessmentResultService } from "../../src/services/assessment-result-service.js";
import { SessionService } from "../../src/services/session-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests");
const schemaName = `p0_07_${randomUUID().replaceAll("-", "")}`;
const isolatedUrl = new URL(databaseUrl);
isolatedUrl.searchParams.set("schema", schemaName);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: isolatedUrl.toString() }, { schema: schemaName }) });
const appBaseUrl = "https://health.example";
const tokenSecret = "p0-07-integration-token-secret-at-least-32-characters";
const fixedNow = new Date("2026-08-05T12:00:00.000Z");

beforeAll(() => {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
    stdio: "pipe",
  });
});
afterAll(async () => prisma.$disconnect());

async function setup(options: { complete?: boolean } = { complete: true }) {
  const token = `result-token-${randomUUID()}`;
  const sessionService = new SessionService(prisma, {
    tokenSecret,
    secureCookie: false,
    now: () => fixedNow,
    createToken: () => token,
  });
  const sessionsPost = createSessionsPostRoute({ appBaseUrl, getService: () => sessionService });
  const created = await sessionsPost(new Request(`${appBaseUrl}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: appBaseUrl },
    body: JSON.stringify({ ageRange: "30_39" }),
  }));
  const data = ((await created.json()) as { data: { sessionId: string; assessment: { id: string } } }).data;
  const cookie = created.headers.get("set-cookie")!.split(";", 1)[0]!;
  await prisma.assessment.update({
    where: { id: data.assessment.id },
    data: {
      sex: "FEMALE",
      goal: "LOSE_WEIGHT",
      age: 35,
      heightCm: 170,
      weightKg: 80,
      targetWeightKg: 70,
      activityLevel: "MODERATE",
      version: 7,
    },
  });
  if (options.complete !== false) {
    const completion = new AssessmentCompletionService(prisma, { tokenSecret, secureCookie: false, now: () => fixedNow });
    const postComplete = createAssessmentCompletionPostRoute({ appBaseUrl, getService: () => completion });
    const response = await postComplete(new Request(`${appBaseUrl}/api/assessments/${data.assessment.id}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: appBaseUrl, cookie },
      body: JSON.stringify({ version: 7 }),
    }), { params: Promise.resolve({ id: data.assessment.id }) });
    expect(response.status).toBe(200);
  }
  return { ...data, cookie };
}

function resultRoute(logs?: SafeLogEntry[]) {
  const service = new AssessmentResultService(prisma, { tokenSecret, secureCookie: false, now: () => fixedNow });
  return createAssessmentResultGetRoute({
    getService: () => service,
    ...(logs ? { logger: (entry: SafeLogEntry) => logs.push(entry) } : {}),
  });
}

function getResult(cookie: string | null, assessmentId: string, route = resultRoute()) {
  return route(new Request(`${appBaseUrl}/api/assessments/${assessmentId}/result`, {
    headers: cookie ? { cookie } : {},
  }), { params: Promise.resolve({ id: assessmentId }) });
}

async function body(response: Response) {
  return (await response.json()) as { data?: Record<string, unknown>; error?: { code: string; requestId: string } };
}

const FREE_KEYS = [
  "accessLevel", "algorithmVersion", "assessmentId", "bmi", "bmiCategory", "disclaimer", "isLocked", "summary", "unlockableSections",
];
const PROTECTED_KEYS = [
  "bmrKcal", "tdeeKcal", "recommendedCaloriesKcal", "estimatedWeeks", "targetDate", "calculationDate", "predictionCurve", "calorieFloorApplied",
];

describe("P0-07 result entitlement and serialization", () => {
  it("P0-07-T01 returns an exact Free whitelist with every protected field absent", async () => {
    const context = await setup();
    const response = await getResult(context.cookie, context.assessment.id);
    expect(response.status).toBe(200);
    const payload = (await body(response)).data!;
    expect(Object.keys(payload).sort()).toEqual(FREE_KEYS);
    expect(payload).toEqual({
      assessmentId: context.assessment.id,
      accessLevel: "FREE",
      bmi: 27.7,
      bmiCategory: "OVERWEIGHT",
      summary: "Your estimated BMI is above the general reference range.",
      isLocked: true,
      unlockableSections: [...UNLOCKABLE_SECTIONS],
      algorithmVersion: "v1",
      disclaimer: RESULT_DISCLAIMER,
    });
    for (const field of PROTECTED_KEYS) expect(payload).not.toHaveProperty(field);
  });

  it("P0-07-T02 returns every Full field only for an ACTIVE Session entitlement", async () => {
    const context = await setup();
    await prisma.subscription.update({ where: { sessionId: context.sessionId }, data: { status: "ACTIVE" } });
    const response = await getResult(context.cookie, context.assessment.id);
    expect(response.status).toBe(200);
    const payload = (await body(response)).data!;
    expect(Object.keys(payload).sort()).toEqual([...FREE_KEYS, ...PROTECTED_KEYS].sort());
    expect(payload).toMatchObject({
      accessLevel: "FULL",
      isLocked: false,
      unlockableSections: [],
      bmrKcal: 1527,
      tdeeKcal: 2366,
      recommendedCaloriesKcal: 1866,
      estimatedWeeks: 20,
      targetDate: "2026-12-23",
      calculationDate: "2026-08-05",
      calorieFloorApplied: false,
    });
    expect(payload.predictionCurve).toBeInstanceOf(Array);

    await prisma.subscription.update({ where: { sessionId: context.sessionId }, data: { status: "EXPIRED" } });
    const expired = (await body(await getResult(context.cookie, context.assessment.id))).data!;
    expect(Object.keys(expired).sort()).toEqual(FREE_KEYS);
    expect(expired.accessLevel).toBe("FREE");
  });

  it("P0-07-T03 rejects no Session, another Session, and an unfinished Assessment without enumeration", async () => {
    const completed = await setup();
    const other = await setup();
    const unfinished = await setup({ complete: false });

    const noSession = await getResult(null, completed.assessment.id);
    expect(noSession.status).toBe(401);
    expect((await body(noSession)).error?.code).toBe("SESSION_REQUIRED");
    const foreign = await getResult(other.cookie, completed.assessment.id);
    expect(foreign.status).toBe(404);
    expect((await body(foreign)).error?.code).toBe("RESOURCE_NOT_FOUND");
    const missing = await getResult(completed.cookie, randomUUID());
    expect(missing.status).toBe(404);
    expect((await body(missing)).error?.code).toBe("RESOURCE_NOT_FOUND");
    const malformed = await getResult(completed.cookie, "not-an-assessment-id");
    expect(malformed.status).toBe(404);
    expect((await body(malformed)).error?.code).toBe("RESOURCE_NOT_FOUND");
    const early = await getResult(unfinished.cookie, unfinished.assessment.id);
    expect(early.status).toBe(409);
    expect((await body(early)).error?.code).toBe("ASSESSMENT_NOT_COMPLETED");
  });

  it("P0-07-T04 returns a stable logged 500 for a completed Assessment missing its Result", async () => {
    const context = await setup({ complete: false });
    await prisma.assessment.update({
      where: { id: context.assessment.id },
      data: { status: "COMPLETED", completedAt: fixedNow, version: 8 },
    });
    const logs: SafeLogEntry[] = [];
    const response = await getResult(context.cookie, context.assessment.id, resultRoute(logs));
    expect(response.status).toBe(500);
    const payload = await body(response);
    expect(payload.error?.code).toBe("INTERNAL_ERROR");
    expect(payload.error?.requestId).toMatch(/^req_/);
    expect(logs).toEqual([expect.objectContaining({
      requestId: payload.error?.requestId,
      path: `/api/assessments/${context.assessment.id}/result`,
      status: 500,
      errorCode: "INTERNAL_ERROR",
    })]);
    expect(await prisma.assessmentResult.count({ where: { assessmentId: context.assessment.id } })).toBe(0);
  });
});
