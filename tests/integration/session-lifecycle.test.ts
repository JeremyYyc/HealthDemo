import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { createAssessmentsPostRoute } from "../../src/api/routes/assessments.js";
import { createSessionGetRoute } from "../../src/api/routes/session.js";
import { createSessionsPostRoute } from "../../src/api/routes/sessions.js";
import { SessionService } from "../../src/services/session-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests");

const schemaName = `p0_02_${randomUUID().replaceAll("-", "")}`;
const isolatedUrl = new URL(databaseUrl);
isolatedUrl.searchParams.set("schema", schemaName);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: isolatedUrl.toString() }, { schema: schemaName }),
});
const appBaseUrl = "https://health.example";
const tokenSecret = "integration-session-secret-at-least-32-characters";

beforeAll(() => {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
    stdio: "pipe",
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

function setup(nowReference = { value: new Date("2026-08-05T12:00:00Z") }) {
  const token = `token-${randomUUID()}`;
  const service = new SessionService(prisma, {
    tokenSecret,
    secureCookie: true,
    now: () => nowReference.value,
    createToken: () => token,
  });
  return {
    token,
    nowReference,
    sessionsPost: createSessionsPostRoute({ appBaseUrl, getService: () => service }),
    sessionGet: createSessionGetRoute({ getService: () => service }),
    assessmentsPost: createAssessmentsPostRoute({ appBaseUrl, getService: () => service }),
  };
}

function jsonPost(path: string, body: unknown, cookie?: string): Request {
  return new Request(`${appBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: appBaseUrl,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function cookieHeader(response: Response): string {
  return response.headers.get("set-cookie")!.split(";", 1)[0]!;
}

async function dataOf<T>(response: Response): Promise<T> {
  return ((await response.json()) as { data: T }).data;
}

describe("P0-02 anonymous Session and Assessment lifecycle", () => {
  it("P0-02-T01 atomically creates a Session, in-progress Assessment, Subscription, and secure cookie", async () => {
    const routes = setup();
    const response = await routes.sessionsPost(jsonPost("/api/sessions", { ageRange: "18_29" }));
    const data = await dataOf<{ sessionId: string; assessment: { id: string; answers: Record<string, unknown> } }>(response);

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toMatch(
      /^health_demo_session=[^;]+; Max-Age=2592000; Expires=.*; Path=\/; HttpOnly; SameSite=Lax; Secure$/,
    );
    expect(JSON.stringify(data)).not.toContain(routes.token);
    expect(data.assessment.answers).toEqual({ ageRange: "18_29" });
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: data.sessionId },
      include: { assessments: true, subscription: true },
    });
    expect(session.tokenHash).not.toBe(routes.token);
    expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(session.assessments).toHaveLength(1);
    expect(session.assessments[0]).toMatchObject({ id: data.assessment.id, status: "IN_PROGRESS" });
    expect(session.subscription).toMatchObject({ status: "INACTIVE" });
  });

  it("P0-02-T02 reuses the original in-progress Assessment and never overwrites ageRange", async () => {
    const routes = setup();
    const created = await routes.sessionsPost(jsonPost("/api/sessions", { ageRange: "18_29" }));
    const cookie = cookieHeader(created);
    const first = await dataOf<{ sessionId: string; assessment: { id: string } }>(created);
    const repeated = await routes.sessionsPost(jsonPost("/api/sessions", { ageRange: "50_100" }, cookie));
    const second = await dataOf<{ assessment: { id: string; answers: Record<string, unknown> } }>(repeated);

    expect(repeated.status).toBe(200);
    expect(second.assessment.id).toBe(first.assessment.id);
    expect(second.assessment.answers.ageRange).toBe("18_29");
    expect(await prisma.assessment.count({ where: { sessionId: first.sessionId } })).toBe(1);
  });

  it("P0-02-T03 returns the deterministic latest completed Assessment and explicit actions without creating", async () => {
    const routes = setup();
    const created = await routes.sessionsPost(jsonPost("/api/sessions", { ageRange: "30_39" }));
    const cookie = cookieHeader(created);
    const initial = await dataOf<{ sessionId: string; assessment: { id: string } }>(created);
    await prisma.assessment.update({
      where: { id: initial.assessment.id },
      data: { status: "COMPLETED", completedAt: new Date("2026-08-04T10:00:00Z") },
    });
    const latest = await prisma.assessment.create({
      data: {
        sessionId: initial.sessionId,
        status: "COMPLETED",
        completedAt: new Date("2026-08-05T10:00:00Z"),
        updatedAt: new Date("2026-08-05T10:00:00Z"),
      },
    });
    const tiedLatest = await prisma.assessment.create({
      data: {
        sessionId: initial.sessionId,
        status: "COMPLETED",
        completedAt: new Date("2026-08-05T10:00:00Z"),
        updatedAt: new Date("2026-08-05T10:00:00Z"),
      },
    });
    const deterministicLatestId = [latest.id, tiedLatest.id].sort().at(-1)!;

    const response = await routes.sessionsPost(jsonPost("/api/sessions", { ageRange: "50_100" }, cookie));
    const data = await dataOf<{ assessment: { id: string; actions: string[] } }>(response);
    expect(response.status).toBe(200);
    expect(data.assessment).toMatchObject({ id: deterministicLatestId, actions: ["VIEW_RESULT", "START_NEW"] });
    expect(await prisma.assessment.count({ where: { sessionId: initial.sessionId } })).toBe(3);
  });

  it("P0-02-T04 concurrent explicit starts create at most one in-progress Assessment", async () => {
    const routes = setup();
    const created = await routes.sessionsPost(jsonPost("/api/sessions", { ageRange: "40_49" }));
    const cookie = cookieHeader(created);
    const initial = await dataOf<{ sessionId: string; assessment: { id: string } }>(created);
    await prisma.assessment.update({
      where: { id: initial.assessment.id },
      data: { status: "COMPLETED", completedAt: new Date("2026-08-05T12:00:00Z") },
    });

    const invalidBody = await routes.assessmentsPost(jsonPost("/api/assessments", { unexpected: true }, cookie));
    expect(invalidBody.status).toBe(400);
    const unauthorized = await routes.assessmentsPost(jsonPost("/api/assessments", {}));
    expect(unauthorized.status).toBe(401);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => routes.assessmentsPost(jsonPost("/api/assessments", {}, cookie))),
    );
    const returned = await Promise.all(
      responses.map((response) => dataOf<{ id: string; created: boolean }>(response)),
    );
    expect(responses.filter(({ status }) => status === 201)).toHaveLength(1);
    expect(new Set(returned.map(({ id }) => id)).size).toBe(1);
    expect(await prisma.assessment.count({ where: { sessionId: initial.sessionId, status: "IN_PROGRESS" } })).toBe(1);
  });

  it("P0-02-T05 rejects expired/tampered cookies, clears them, and never rolls expiry forward", async () => {
    const nowReference = { value: new Date("2026-08-05T12:00:00Z") };
    const routes = setup(nowReference);
    const created = await routes.sessionsPost(jsonPost("/api/sessions", { ageRange: "50_100" }));
    const cookie = cookieHeader(created);
    const data = await dataOf<{ sessionId: string }>(created);
    const originalExpiry = (await prisma.session.findUniqueOrThrow({ where: { id: data.sessionId } })).expiresAt;

    nowReference.value = new Date("2026-08-20T12:00:00Z");
    const valid = await routes.sessionGet(new Request(`${appBaseUrl}/api/session`, { headers: { cookie } }));
    expect(valid.status).toBe(200);
    expect(valid.headers.has("set-cookie")).toBe(false);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: data.sessionId } })).expiresAt).toEqual(originalExpiry);

    const tampered = await routes.sessionGet(
      new Request(`${appBaseUrl}/api/session`, { headers: { cookie: `${cookie}tampered` } }),
    );
    expect(tampered.status).toBe(401);
    expect(tampered.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(tampered.headers.get("set-cookie")).toContain("Secure");
    const sessionCount = await prisma.session.count();
    const tamperedEntry = await routes.sessionsPost(
      jsonPost("/api/sessions", { ageRange: "18_29" }, `${cookie}tampered`),
    );
    expect(tamperedEntry.status).toBe(401);
    expect(await prisma.session.count()).toBe(sessionCount);

    const missing = await routes.sessionGet(new Request(`${appBaseUrl}/api/session`));
    expect(missing.status).toBe(401);

    nowReference.value = new Date("2026-09-05T12:00:00Z");
    const expired = await routes.sessionGet(new Request(`${appBaseUrl}/api/session`, { headers: { cookie } }));
    expect(expired.status).toBe(401);
    expect(expired.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await prisma.session.findUniqueOrThrow({ where: { id: data.sessionId } })).expiresAt).toEqual(originalExpiry);
  });

  it("P0-02-T06 restores saved answers, version, completed steps, and the first missing step", async () => {
    const routes = setup();
    const created = await routes.sessionsPost(jsonPost("/api/sessions", { ageRange: "18_29" }));
    const cookie = cookieHeader(created);
    const entry = await dataOf<{ assessment: { id: string } }>(created);
    await prisma.assessment.update({
      where: { id: entry.assessment.id },
      data: { sex: "FEMALE", goal: "LOSE_WEIGHT", age: 25, heightCm: 170, version: 5 },
    });

    const response = await routes.sessionGet(new Request(`${appBaseUrl}/api/session`, { headers: { cookie } }));
    const data = await dataOf<{
      subscriptionStatus: string;
      assessment: {
        currentStep: string;
        nextStep: string;
        completedSteps: string[];
        answers: Record<string, unknown>;
        version: number;
      };
    }>(response);
    expect(response.status).toBe(200);
    expect(data.subscriptionStatus).toBe("INACTIVE");
    expect(data.assessment).toMatchObject({
      currentStep: "CURRENT_WEIGHT",
      nextStep: "CURRENT_WEIGHT",
      completedSteps: ["AGE_RANGE", "SEX", "GOAL", "AGE", "HEIGHT"],
      answers: { ageRange: "18_29", sex: "FEMALE", goal: "LOSE_WEIGHT", age: 25, heightCm: 170 },
      version: 5,
    });

    await prisma.assessment.update({ where: { id: entry.assessment.id }, data: { age: 35 } });
    const invalidAge = await dataOf<{
      assessment: { nextStep: string; completedSteps: string[]; answers: Record<string, unknown> };
    }>(await routes.sessionGet(new Request(`${appBaseUrl}/api/session`, { headers: { cookie } })));
    expect(invalidAge.assessment.nextStep).toBe("AGE");
    expect(invalidAge.assessment.completedSteps).not.toContain("AGE");
    expect(invalidAge.assessment.answers.age).toBe(35);

    await prisma.assessment.update({
      where: { id: entry.assessment.id },
      data: { age: 25, weightKg: 80, targetWeightKg: 85, activityLevel: "MODERATE" },
    });
    const invalidTarget = await dataOf<{ assessment: { nextStep: string; completedSteps: string[] } }>(
      await routes.sessionGet(new Request(`${appBaseUrl}/api/session`, { headers: { cookie } })),
    );
    expect(invalidTarget.assessment.nextStep).toBe("TARGET_WEIGHT");
    expect(invalidTarget.assessment.completedSteps).not.toContain("TARGET_WEIGHT");

    await prisma.assessment.update({
      where: { id: entry.assessment.id },
      data: { goal: "MAINTAIN_WEIGHT", heightCm: 140, weightKg: 30.2, targetWeightKg: 32.2 },
    });
    const exactMaintenanceBoundary = await dataOf<{
      assessment: { nextStep: string; completedSteps: string[] };
    }>(await routes.sessionGet(new Request(`${appBaseUrl}/api/session`, { headers: { cookie } })));
    expect(exactMaintenanceBoundary.assessment.nextStep).toBe("COMPLETE");
    expect(exactMaintenanceBoundary.assessment.completedSteps).toContain("TARGET_WEIGHT");

    await prisma.assessment.update({
      where: { id: entry.assessment.id },
      data: { goal: "GAIN_WEIGHT", heightCm: 170, weightKg: 30.2, targetWeightKg: 56.2 },
    });
    const exact104Weeks = await dataOf<{ assessment: { nextStep: string; completedSteps: string[] } }>(
      await routes.sessionGet(new Request(`${appBaseUrl}/api/session`, { headers: { cookie } })),
    );
    expect(exact104Weeks.assessment.nextStep).toBe("COMPLETE");
    expect(exact104Weeks.assessment.completedSteps).toContain("TARGET_WEIGHT");
  });
});
