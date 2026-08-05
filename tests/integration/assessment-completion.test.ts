import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { createAssessmentCompletionPostRoute } from "../../src/api/routes/assessment-completion.js";
import { createAssessmentStepPatchRoute } from "../../src/api/routes/assessment-step.js";
import { createSessionsPostRoute } from "../../src/api/routes/sessions.js";
import { calculateHealthResult } from "../../src/domain/health-calculation.js";
import { AssessmentCompletionService } from "../../src/services/assessment-completion-service.js";
import { AssessmentStepService } from "../../src/services/assessment-step-service.js";
import { SessionService } from "../../src/services/session-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests");
const schemaName = `p0_06_${randomUUID().replaceAll("-", "")}`;
const isolatedUrl = new URL(databaseUrl);
isolatedUrl.searchParams.set("schema", schemaName);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: isolatedUrl.toString() }, { schema: schemaName }),
});
const appBaseUrl = "https://health.example";
const tokenSecret = "p0-06-integration-token-secret-at-least-32-characters";
const fixedNow = new Date("2026-08-05T23:59:59.900Z");

beforeAll(() => {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
    stdio: "pipe",
  });
});
afterAll(async () => prisma.$disconnect());

async function setup() {
  const token = `complete-token-${randomUUID()}`;
  const sessionService = new SessionService(prisma, {
    tokenSecret,
    secureCookie: false,
    now: () => fixedNow,
    createToken: () => token,
  });
  const sessionsPost = createSessionsPostRoute({ appBaseUrl, getService: () => sessionService });
  const created = await sessionsPost(
    new Request(`${appBaseUrl}/api/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: appBaseUrl },
      body: JSON.stringify({ ageRange: "30_39" }),
    }),
  );
  const data = ((await created.json()) as { data: { sessionId: string; assessment: { id: string } } }).data;
  const cookie = created.headers.get("set-cookie")!.split(";", 1)[0]!;
  const stepService = new AssessmentStepService(prisma, { tokenSecret, secureCookie: false, now: () => fixedNow });
  const patch = createAssessmentStepPatchRoute({ appBaseUrl, getService: () => stepService });
  return { ...data, cookie, patch };
}

function jsonRequest(path: string, body: unknown, cookie: string, method = "POST") {
  return new Request(`${appBaseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", origin: appBaseUrl, cookie },
    body: JSON.stringify(body),
  });
}

async function save(
  context: Awaited<ReturnType<typeof setup>>,
  step: string,
  body: Record<string, unknown>,
) {
  return context.patch(jsonRequest("/api/step", body, context.cookie, "PATCH"), {
    params: Promise.resolve({ id: context.assessment.id, step }),
  });
}

async function fill(context: Awaited<ReturnType<typeof setup>>) {
  const answers = [
    ["sex", { sex: "FEMALE" }],
    ["goal", { goal: "LOSE_WEIGHT" }],
    ["age", { age: 35 }],
    ["height", { heightCm: 170 }],
    ["current-weight", { weightKg: 80 }],
    ["target-weight", { targetWeightKg: 70 }],
    ["activity", { activityLevel: "MODERATE" }],
  ] as const;
  let version = 0;
  for (const [step, answer] of answers) {
    const response = await save(context, step, { ...answer, version });
    expect(response.status, step).toBe(200);
    version += 1;
  }
  return version;
}

function completeRoute(options: ConstructorParameters<typeof AssessmentCompletionService>[1] = {
  tokenSecret,
  secureCookie: false,
  now: () => fixedNow,
}) {
  const service = new AssessmentCompletionService(prisma, options);
  return createAssessmentCompletionPostRoute({ appBaseUrl, getService: () => service });
}

async function complete(
  context: Awaited<ReturnType<typeof setup>>,
  version: number,
  route = completeRoute(),
) {
  return route(jsonRequest(`/api/assessments/${context.assessment.id}/complete`, { version }, context.cookie), {
    params: Promise.resolve({ id: context.assessment.id }),
  });
}

async function data(response: Response) {
  return ((await response.json()) as { data: Record<string, unknown> }).data;
}

async function error(response: Response) {
  return ((await response.json()) as { error: { code: string; details: { field: string; reason: string }[] } }).error;
}

describe("P0-06 PostgreSQL completion transaction", () => {
  it("P0-06-T01 creates one frozen Result and completes the Assessment", async () => {
    const context = await setup();
    const version = await fill(context);
    const response = await complete(context, version);
    expect(response.status).toBe(200);
    expect(await data(response)).toEqual({
      assessmentId: context.assessment.id,
      status: "COMPLETED",
      completedAt: fixedNow.toISOString(),
      resultUrl: `/api/assessments/${context.assessment.id}/result`,
      version: version + 1,
      replayed: false,
    });
    const assessment = await prisma.assessment.findUniqueOrThrow({ where: { id: context.assessment.id } });
    const result = await prisma.assessmentResult.findUniqueOrThrow({ where: { assessmentId: context.assessment.id } });
    expect(assessment).toMatchObject({ status: "COMPLETED", version: version + 1, completedAt: fixedNow });
    expect(result).toMatchObject({
      assessmentId: context.assessment.id,
      bmiCategory: "OVERWEIGHT",
      algorithmVersion: "v1",
      calculationDate: new Date("2026-08-05T00:00:00.000Z"),
    });
    expect(result.predictionCurve).toBeInstanceOf(Array);
  });

  it("P0-06-T02 returns ordered requiredSteps for missing or cross-field-invalid data without a Result", async () => {
    const missing = await setup();
    const missingResponse = await complete(missing, 0);
    expect(missingResponse.status).toBe(422);
    expect(await error(missingResponse)).toMatchObject({
      code: "ASSESSMENT_INCOMPLETE",
      details: [
        { field: "requiredSteps", reason: "SEX" },
        { field: "requiredSteps", reason: "GOAL" },
        { field: "requiredSteps", reason: "AGE" },
        { field: "requiredSteps", reason: "HEIGHT" },
        { field: "requiredSteps", reason: "CURRENT_WEIGHT" },
        { field: "requiredSteps", reason: "TARGET_WEIGHT" },
        { field: "requiredSteps", reason: "ACTIVITY_LEVEL" },
      ],
    });
    expect(await prisma.assessmentResult.count({ where: { assessmentId: missing.assessment.id } })).toBe(0);

    const invalid = await setup();
    const version = await fill(invalid);
    await prisma.assessment.update({
      where: { id: invalid.assessment.id },
      data: { targetWeightKg: 90 },
    });
    const invalidResponse = await complete(invalid, version);
    expect(invalidResponse.status).toBe(422);
    expect(await error(invalidResponse)).toMatchObject({
      code: "ASSESSMENT_INCOMPLETE",
      details: [{ field: "requiredSteps", reason: "TARGET_WEIGHT" }],
    });
    expect(await prisma.assessmentResult.count({ where: { assessmentId: invalid.assessment.id } })).toBe(0);
  });

  it("P0-06-T03 rolls back calculation and post-write failures completely", async () => {
    const calculationFailure = await setup();
    const version = await fill(calculationFailure);
    const failedCalculation = await complete(
      calculationFailure,
      version,
      completeRoute({
        tokenSecret,
        secureCookie: false,
        now: () => fixedNow,
        calculate: () => {
          throw new Error("injected calculation failure");
        },
      }),
    );
    expect(failedCalculation.status).toBe(500);
    expect(await prisma.assessmentResult.count({ where: { assessmentId: calculationFailure.assessment.id } })).toBe(0);
    expect(await prisma.assessment.findUniqueOrThrow({ where: { id: calculationFailure.assessment.id } })).toMatchObject({
      status: "IN_PROGRESS",
      version,
      completedAt: null,
    });

    const writeFailure = await setup();
    const writeVersion = await fill(writeFailure);
    const failedWrite = await complete(
      writeFailure,
      writeVersion,
      completeRoute({
        tokenSecret,
        secureCookie: false,
        now: () => fixedNow,
        calculate: calculateHealthResult,
        afterResultCreated: () => {
          throw new Error("injected write failure");
        },
      }),
    );
    expect(failedWrite.status).toBe(500);
    expect(await prisma.assessmentResult.count({ where: { assessmentId: writeFailure.assessment.id } })).toBe(0);
    expect(await prisma.assessment.findUniqueOrThrow({ where: { id: writeFailure.assessment.id } })).toMatchObject({
      status: "IN_PROGRESS",
      version: writeVersion,
      completedAt: null,
    });
  });

  it("P0-06-T04 rejects stale completion and never calculates across a competing last save", async () => {
    const stale = await setup();
    const staleVersion = await fill(stale);
    const conflict = await complete(stale, staleVersion - 1);
    expect(conflict.status).toBe(409);
    expect((await error(conflict)).code).toBe("VERSION_CONFLICT");
    expect(await prisma.assessmentResult.count({ where: { assessmentId: stale.assessment.id } })).toBe(0);

    const racing = await setup();
    const version = await fill(racing);
    await prisma.assessment.update({ where: { id: racing.assessment.id }, data: { activityLevel: null } });
    const [saved, completed] = await Promise.all([
      save(racing, "activity", { activityLevel: "ACTIVE", version }),
      complete(racing, version),
    ]);
    const fresh = await prisma.assessment.findUniqueOrThrow({ where: { id: racing.assessment.id } });
    expect(saved.status).toBe(200);
    expect([409, 422]).toContain(completed.status);
    expect(fresh).toMatchObject({ status: "IN_PROGRESS", version: version + 1, activityLevel: "ACTIVE" });
    expect(await prisma.assessmentResult.count({ where: { assessmentId: racing.assessment.id } })).toBe(0);
  });

  it("P0-06-T05 serializes same-version concurrent completes into one Result and a replay", async () => {
    const context = await setup();
    const version = await fill(context);
    const [first, second] = await Promise.all([complete(context, version), complete(context, version)]);
    expect([first.status, second.status]).toEqual([200, 200]);
    const payloads = [await data(first), await data(second)];
    expect(payloads.map((payload) => payload.replayed).sort()).toEqual([false, true]);
    expect(payloads[0]).toMatchObject({
      assessmentId: context.assessment.id,
      completedAt: fixedNow.toISOString(),
      version: version + 1,
    });
    expect(payloads[1]).toMatchObject({
      assessmentId: context.assessment.id,
      completedAt: fixedNow.toISOString(),
      version: version + 1,
    });
    expect(await prisma.assessmentResult.count({ where: { assessmentId: context.assessment.id } })).toBe(1);

    const uniqueConflict = await setup();
    const uniqueVersion = await fill(uniqueConflict);
    let injected = false;
    const recovered = await complete(
      uniqueConflict,
      uniqueVersion,
      completeRoute({
        tokenSecret,
        secureCookie: false,
        now: () => fixedNow,
        beforeResultCreated: async () => {
          if (injected) return;
          injected = true;
          const calculated = calculateHealthResult({
            ageRange: "30_39",
            sex: "FEMALE",
            goal: "LOSE_WEIGHT",
            age: 35,
            heightCm: 170,
            weightKg: 80,
            targetWeightKg: 70,
            activityLevel: "MODERATE",
            calculationDate: "2026-08-05",
          });
          await prisma.$transaction(async (transaction) => {
            await transaction.assessmentResult.create({
              data: {
                assessmentId: uniqueConflict.assessment.id,
                bmi: calculated.bmi,
                bmiCategory: calculated.bmiCategory,
                bmrKcal: calculated.bmrKcal,
                tdeeKcal: calculated.tdeeKcal,
                recommendedCaloriesKcal: calculated.recommendedCaloriesKcal,
                targetDate: new Date(`${calculated.targetDate}T00:00:00.000Z`),
                calculationDate: new Date("2026-08-05T00:00:00.000Z"),
                estimatedWeeks: calculated.estimatedWeeks,
                predictionCurve: calculated.predictionCurve.map((point) => ({ ...point })),
                calorieFloorApplied: calculated.calorieFloorApplied,
                algorithmVersion: calculated.algorithmVersion,
              },
            });
            await transaction.assessment.update({
              where: { id: uniqueConflict.assessment.id },
              data: { status: "COMPLETED", completedAt: fixedNow, version: { increment: 1 } },
            });
          });
        },
      }),
    );
    expect(recovered.status).toBe(200);
    expect(await data(recovered)).toMatchObject({
      assessmentId: uniqueConflict.assessment.id,
      version: uniqueVersion + 1,
      replayed: true,
    });
    expect(await prisma.assessmentResult.count({ where: { assessmentId: uniqueConflict.assessment.id } })).toBe(1);
  });

  it("P0-06-T06 replays completed metadata, ignores stale versions, and never embeds Result fields", async () => {
    const context = await setup();
    const version = await fill(context);
    const initial = await data(await complete(context, version));
    const replayResponse = await complete(context, 0);
    expect(replayResponse.status).toBe(200);
    const replay = await data(replayResponse);
    expect(replay).toEqual({ ...initial, replayed: true });
    for (const protectedField of [
      "bmi",
      "bmrKcal",
      "tdeeKcal",
      "recommendedCaloriesKcal",
      "predictionCurve",
      "algorithmVersion",
    ]) {
      expect(replay).not.toHaveProperty(protectedField);
    }
    expect(await prisma.assessmentResult.count({ where: { assessmentId: context.assessment.id } })).toBe(1);

    const other = await setup();
    const foreign = await complete({ ...context, cookie: other.cookie }, 0);
    expect(foreign.status).toBe(404);
    expect((await error(foreign)).code).toBe("RESOURCE_NOT_FOUND");
  });
});
