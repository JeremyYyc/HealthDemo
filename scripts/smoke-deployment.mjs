import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const baseUrl = process.env.SMOKE_BASE_URL;
const environment = process.env.SMOKE_ENVIRONMENT ?? "unspecified";
const expectedCommitSha = process.env.SMOKE_EXPECTED_COMMIT_SHA;
const reviewCode = process.env.SMOKE_REVIEW_CODE;
const requireDemoExchange = process.env.SMOKE_REQUIRE_DEMO_EXCHANGE === "true";
const protectedFields = ["bmrKcal", "tdeeKcal", "recommendedCaloriesKcal", "estimatedWeeks", "targetDate", "calculationDate", "predictionCurve", "calorieFloorApplied"];

class SmokeFailure extends Error {
  constructor(stage, status = null, code = null) {
    super(stage);
    this.stage = stage;
    this.status = status;
    this.code = code;
  }
}

function origin() {
  if (!baseUrl) throw new SmokeFailure("configuration");
  try {
    return new URL(baseUrl).origin;
  } catch {
    throw new SmokeFailure("configuration");
  }
}

async function call(stage, path, options = {}, jar = { cookie: "" }) {
  const method = options.method ?? "GET";
  const headers = { ...(jar.cookie ? { cookie: jar.cookie } : {}) };
  if (method !== "GET") {
    headers["content-type"] = "application/json";
    headers.origin = origin();
  }
  const response = await fetch(new URL(path, `${origin()}/`), {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    redirect: "manual",
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) jar.cookie = setCookie.split(";", 1)[0];
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new SmokeFailure(stage, response.status);
  }
  if (!response.ok) throw new SmokeFailure(stage, response.status, payload?.error?.code ?? null);
  return payload.data;
}

function requireFields(stage, value, fields) {
  if (!value || fields.some((field) => !(field in value))) throw new SmokeFailure(stage);
}

export function isExpectedDeploymentVersion(appVersion, expectedVersion) {
  return !expectedVersion || appVersion === expectedVersion;
}

async function run() {
  const checks = [];
  const health = await call("health", "/api/health");
  requireFields("health", health, ["status", "database", "appVersion"]);
  if (health.status !== "ok" || health.database !== "reachable") throw new SmokeFailure("health");
  if (!isExpectedDeploymentVersion(health.appVersion, expectedCommitSha)) throw new SmokeFailure("health-version");
  checks.push("health");

  const jar = { cookie: "" };
  const entered = await call("session-create", "/api/sessions", { method: "POST", body: { ageRange: "30_39" } }, jar);
  requireFields("session-create", entered?.assessment, ["id", "version"]);
  const assessmentId = entered.assessment.id;
  let version = entered.assessment.version;
  const steps = [
    ["age-range", { ageRange: "30_39" }],
    ["sex", { sex: "FEMALE" }],
    ["goal", { goal: "LOSE_WEIGHT" }],
    ["age", { age: 35 }],
    ["height", { heightCm: 170 }],
    ["current-weight", { weightKg: 80 }],
    ["target-weight", { targetWeightKg: 70 }],
    ["activity", { activityLevel: "MODERATE" }],
  ];
  for (const [slug, answer] of steps) {
    const saved = await call(`step-${slug}`, `/api/assessments/${assessmentId}/steps/${slug}`, { method: "PATCH", body: { ...answer, version } }, jar);
    if (typeof saved?.version !== "number") throw new SmokeFailure(`step-${slug}`);
    version = saved.version;
  }
  checks.push("eight-step-save");

  await call("complete", `/api/assessments/${assessmentId}/complete`, { method: "POST", body: { version } }, jar);
  const free = await call("free-result", `/api/assessments/${assessmentId}/result`, {}, jar);
  if (free?.accessLevel !== "FREE" || protectedFields.some((field) => field in free)) throw new SmokeFailure("free-entitlement");
  checks.push("free-entitlement");

  await call("demo-payment", "/api/pay", { method: "POST", body: { assessmentId, idempotencyKey: `smoke_${randomUUID()}` } }, jar);
  const full = await call("full-result", `/api/assessments/${assessmentId}/result`, {}, jar);
  if (full?.accessLevel !== "FULL") throw new SmokeFailure("full-entitlement");
  requireFields("full-entitlement", full, protectedFields);
  checks.push("payment-and-full-entitlement");

  if (reviewCode) {
    const reviewJar = { cookie: "" };
    const exchanged = await call("demo-exchange", "/api/demo/session-exchange", { method: "POST", body: { reviewCode } }, reviewJar);
    if (exchanged?.accessLevel !== "FULL" || typeof exchanged.resultUrl !== "string") throw new SmokeFailure("demo-exchange");
    const paid = await call("paid-session-result", exchanged.resultUrl, {}, reviewJar);
    if (paid?.accessLevel !== "FULL") throw new SmokeFailure("paid-session-result");
    checks.push("paid-session-exchange");
  } else if (requireDemoExchange) {
    throw new SmokeFailure("demo-exchange-configuration");
  }

  console.info(JSON.stringify({ version: "deployment-smoke/v1", environment, outcome: "SUCCEEDED", checks }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await run();
  } catch (error) {
    const failure = error instanceof SmokeFailure ? error : new SmokeFailure("unexpected");
    console.error(JSON.stringify({ version: "deployment-smoke/v1", environment, outcome: "FAILED", stage: failure.stage, status: failure.status, code: failure.code }));
    process.exitCode = 1;
  }
}
