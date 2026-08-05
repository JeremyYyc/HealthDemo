import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { createAssessmentStepPatchRoute } from "../../src/api/routes/assessment-step.js";
import { createSessionGetRoute } from "../../src/api/routes/session.js";
import { createSessionsPostRoute } from "../../src/api/routes/sessions.js";
import { AssessmentStepService } from "../../src/services/assessment-step-service.js";
import { SessionService } from "../../src/services/session-service.js";
import { imperialHeightToCm, poundsToKg } from "../../src/domain/assessment-steps.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests");
const schemaName = `p0_03_${randomUUID().replaceAll("-", "")}`;
const isolatedUrl = new URL(databaseUrl);
isolatedUrl.searchParams.set("schema", schemaName);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: isolatedUrl.toString() }, { schema: schemaName }),
});
const appBaseUrl = "https://health.example";
const tokenSecret = "p0-03-integration-token-secret-at-least-32-characters";

beforeAll(() => {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
    stdio: "pipe",
  });
});
afterAll(async () => prisma.$disconnect());

async function setup(ageRange = "18_29") {
  const token = `step-token-${randomUUID()}`;
  const sessionService = new SessionService(prisma, {
    tokenSecret,
    secureCookie: false,
    now: () => new Date("2026-08-05T12:00:00Z"),
    createToken: () => token,
  });
  const sessionsPost = createSessionsPostRoute({ appBaseUrl, getService: () => sessionService });
  const created = await sessionsPost(
    new Request(`${appBaseUrl}/api/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: appBaseUrl },
      body: JSON.stringify({ ageRange }),
    }),
  );
  const data = ((await created.json()) as { data: { sessionId: string; assessment: { id: string } } }).data;
  const cookie = created.headers.get("set-cookie")!.split(";", 1)[0]!;
  const stepService = new AssessmentStepService(prisma, { tokenSecret, secureCookie: false });
  return {
    ...data,
    cookie,
    sessionGet: createSessionGetRoute({ getService: () => sessionService }),
    patch: createAssessmentStepPatchRoute({ appBaseUrl, getService: () => stepService }),
  };
}

function patchRequest(body: unknown, cookie: string): Request {
  return new Request(`${appBaseUrl}/api/step`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: appBaseUrl, cookie },
    body: JSON.stringify(body),
  });
}

async function save(
  context: Awaited<ReturnType<typeof setup>>,
  step: string,
  body: unknown,
  assessmentId = context.assessment.id,
) {
  return context.patch(patchRequest(body, context.cookie), {
    params: Promise.resolve({ id: assessmentId, step }),
  });
}

async function responseData(response: Response) {
  return ((await response.json()) as { data: Record<string, unknown> }).data;
}

async function responseError(response: Response) {
  return ((await response.json()) as { error: { code: string; details: unknown[] } }).error;
}

describe("P0-03 PostgreSQL step saving", () => {
  it("P0-03-T01 rejects invalid updates without writes or version increments", async () => {
    const invalidCases = [
      ["age-range", { ageRange: "17_29", version: 0 }],
      ["sex", { sex: 7, version: 0 }],
      ["goal", { goal: "SHRINK", version: 0 }],
      ["age", { age: 17, version: 0 }],
      ["height", { heightCm: 250.1, version: 0 }],
      ["current-weight", { weightKg: 29.9, version: 0 }],
      ["target-weight", { targetWeightKg: 350.1, version: 0 }],
      ["activity", { activityLevel: "EXTREME", version: 0 }],
    ] as const;
    for (const [step, body] of invalidCases) {
      const context = await setup();
      const response = await save(context, step, body);
      expect(response.status, step).toBe(400);
      expect((await responseError(response)).code, step).toBe("VALIDATION_ERROR");
      expect(
        (await prisma.assessment.findUniqueOrThrow({ where: { id: context.assessment.id } })).version,
        step,
      ).toBe(0);
    }

    const precisionContext = await setup();
    const precision = await save(precisionContext, "height", { heightCm: 170.55, version: 0 });
    expect(precision.status).toBe(400);
    expect((await responseError(precision)).code).toBe("VALIDATION_ERROR");
    expect(
      (await prisma.assessment.findUniqueOrThrow({ where: { id: precisionContext.assessment.id } })).version,
    ).toBe(0);

    const context = await setup();
    const other = await setup();
    const foreign = await context.patch(patchRequest({ sex: "FEMALE", version: 0 }, other.cookie), {
      params: Promise.resolve({ id: context.assessment.id, step: "sex" }),
    });
    expect(foreign.status).toBe(404);
    expect((await responseError(foreign)).code).toBe("RESOURCE_NOT_FOUND");
    await prisma.assessment.update({ where: { id: context.assessment.id }, data: { status: "COMPLETED" } });
    const locked = await save(context, "sex", { sex: "FEMALE", version: 0 });
    expect(locked.status).toBe(409);
    expect((await responseError(locked)).code).toBe("ASSESSMENT_LOCKED");
  });

  it("P0-03-T02 replays normalized same values before version checks and rejects stale different values", async () => {
    const context = await setup();
    const first = await save(context, "height", { heightCm: 170.0000000001, version: 0 });
    expect(first.status).toBe(200);
    expect(await responseData(first)).toMatchObject({ version: 1, replayed: false, nextStep: "SEX" });
    const replay = await save(context, "height", { heightCm: 170, version: 0 });
    expect(replay.status).toBe(200);
    expect(await responseData(replay)).toMatchObject({ version: 1, replayed: true });
    const conflict = await save(context, "height", { heightCm: 171, version: 0 });
    expect(conflict.status).toBe(409);
    expect((await responseError(conflict)).code).toBe("VERSION_CONFLICT");
    expect((await prisma.assessment.findUniqueOrThrow({ where: { id: context.assessment.id } })).version).toBe(1);

    const staleInvalidAge = await save(context, "age", { age: 35, version: 0 });
    expect(staleInvalidAge.status).toBe(409);
    expect((await responseError(staleInvalidAge)).code).toBe("VERSION_CONFLICT");

    const targetContext = await setup();
    await save(targetContext, "goal", { goal: "LOSE_WEIGHT", version: 0 });
    await save(targetContext, "height", { heightCm: 170, version: 1 });
    await save(targetContext, "current-weight", { weightKg: 80, version: 2 });
    const staleInvalidTarget = await save(targetContext, "target-weight", { targetWeightKg: 85, version: 0 });
    expect(staleInvalidTarget.status).toBe(409);
    expect((await responseError(staleInvalidTarget)).code).toBe("VERSION_CONFLICT");
  });

  it("P0-03-T03 invalidates age in the same versioned update when ageRange changes", async () => {
    const context = await setup();
    await save(context, "age", { age: 25, version: 0 });
    const response = await save(context, "age-range", { ageRange: "30_39", version: 1 });
    expect(await responseData(response)).toMatchObject({
      invalidatedSteps: ["AGE"],
      nextStep: "SEX",
      version: 2,
    });
    expect(await prisma.assessment.findUniqueOrThrow({ where: { id: context.assessment.id } })).toMatchObject({
      age: null,
      version: 2,
    });
  });

  it("P0-03-T04 invalidates target weight after goal, height, or current-weight changes", async () => {
    for (const [step, body] of [
      ["goal", { goal: "GAIN_WEIGHT" }],
      ["height", { heightCm: 100 }],
      ["current-weight", { weightKg: 70 }],
    ] as const) {
      const context = await setup();
      let version = 0;
      for (const [setupStep, value] of [
        ["goal", { goal: "LOSE_WEIGHT" }],
        ["height", { heightCm: 170 }],
        ["current-weight", { weightKg: 80 }],
        ["target-weight", { targetWeightKg: 75 }],
      ] as const) {
        await save(context, setupStep, { ...value, version });
        version += 1;
      }
      const response = await save(context, step, { ...body, version });
      expect(await responseData(response)).toMatchObject({ invalidatedSteps: ["TARGET_WEIGHT"] });
      expect((await prisma.assessment.findUniqueOrThrow({ where: { id: context.assessment.id } })).targetWeightKg).toBeNull();
    }
  });

  it("P0-03-T05 permits independent out-of-order saves and rejects missing dependent prerequisites", async () => {
    const context = await setup();
    const activity = await save(context, "activity", { activityLevel: "MODERATE", version: 0 });
    expect(await responseData(activity)).toMatchObject({ nextStep: "SEX", version: 1 });
    const other = await setup();
    await prisma.assessment.update({ where: { id: other.assessment.id }, data: { ageRange: null } });
    const missingAgeRange = await save(other, "age", { age: 25, version: 0 });
    expect(missingAgeRange.status).toBe(422);
    expect((await responseError(missingAgeRange)).code).toBe("STEP_PREREQUISITE_MISSING");
    const missingTargetInputs = await save(other, "target-weight", { targetWeightKg: 75, version: 0 });
    expect(missingTargetInputs.status).toBe(422);
    expect((await responseError(missingTargetInputs)).code).toBe("STEP_PREREQUISITE_MISSING");
    expect((await prisma.assessment.findUniqueOrThrow({ where: { id: other.assessment.id } })).version).toBe(0);

    const invalidAge = await setup("18_29");
    const ageBusinessError = await save(invalidAge, "age", { age: 35, version: 0 });
    expect(ageBusinessError.status).toBe(422);
    expect((await responseError(ageBusinessError)).code).toBe("BUSINESS_RULE_VIOLATION");

    const invalidTarget = await setup();
    await save(invalidTarget, "goal", { goal: "LOSE_WEIGHT", version: 0 });
    await save(invalidTarget, "height", { heightCm: 170, version: 1 });
    await save(invalidTarget, "current-weight", { weightKg: 80, version: 2 });
    const targetBusinessError = await save(invalidTarget, "target-weight", { targetWeightKg: 85, version: 3 });
    expect(targetBusinessError.status).toBe(422);
    expect((await responseError(targetBusinessError)).code).toBe("BUSINESS_RULE_VIOLATION");
    expect((await prisma.assessment.findUniqueOrThrow({ where: { id: invalidTarget.assessment.id } })).version).toBe(3);
  });

  it("P0-03-T06 allows only one of two concurrent different saves at the same version", async () => {
    const context = await setup();
    const [female, male] = await Promise.all([
      save(context, "sex", { sex: "FEMALE", version: 0 }),
      save(context, "sex", { sex: "MALE", version: 0 }),
    ]);
    expect([female.status, male.status].sort()).toEqual([200, 409]);
    expect((await prisma.assessment.findUniqueOrThrow({ where: { id: context.assessment.id } })).version).toBe(1);
  });

  it("P0-03-T07 stores and echoes normalized metric values from converted imperial boundaries", async () => {
    const context = await setup();
    const heightCm = imperialHeightToCm(3, 3.3700787402);
    const weightKg = poundsToKg(66.1386786555);
    expect((await save(context, "height", { heightCm, version: 0 })).status).toBe(200);
    const response = await save(context, "current-weight", { weightKg, version: 1 });
    expect(response.status).toBe(200);
    const stored = await prisma.assessment.findUniqueOrThrow({ where: { id: context.assessment.id } });
    expect(stored.heightCm?.toNumber()).toBe(100);
    expect(stored.weightKg?.toNumber()).toBe(30);
    expect(await responseData(response)).toMatchObject({ savedStep: "CURRENT_WEIGHT", version: 2 });
    const restored = await context.sessionGet(
      new Request(`${appBaseUrl}/api/session`, { headers: { cookie: context.cookie } }),
    );
    expect(await responseData(restored)).toMatchObject({
      assessment: { answers: { ageRange: "18_29", heightCm: 100, weightKg: 30 } },
    });

    const maximum = await setup();
    const maximumHeightCm = imperialHeightToCm(8, 2.4251968504);
    const maximumWeightKg = poundsToKg(771.6179176471);
    expect((await save(maximum, "height", { heightCm: maximumHeightCm, version: 0 })).status).toBe(200);
    expect((await save(maximum, "current-weight", { weightKg: maximumWeightKg, version: 1 })).status).toBe(200);
    const maximumStored = await prisma.assessment.findUniqueOrThrow({ where: { id: maximum.assessment.id } });
    expect(maximumStored.heightCm?.toNumber()).toBe(250);
    expect(maximumStored.weightKg?.toNumber()).toBe(350);
    const maximumRestored = await maximum.sessionGet(
      new Request(`${appBaseUrl}/api/session`, { headers: { cookie: maximum.cookie } }),
    );
    expect(await responseData(maximumRestored)).toMatchObject({
      assessment: { answers: { ageRange: "18_29", heightCm: 250, weightKg: 350 } },
    });
  });
});
