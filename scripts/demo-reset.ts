import { createHmac, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { DEMO_FIXTURE_IDS } from "../src/domain/demo-fixtures.js";
import { calculateHealthResult } from "../src/domain/health-calculation.js";

const PAID_SESSION_ID = DEMO_FIXTURE_IDS.paid.session;
const PAID_ASSESSMENT_ID = DEMO_FIXTURE_IDS.paid.assessment;
const PAID_RESULT_ID = DEMO_FIXTURE_IDS.paid.result;
const PAID_PAYMENT_ID = DEMO_FIXTURE_IDS.paid.payment;
const PAID_SUBSCRIPTION_ID = DEMO_FIXTURE_IDS.paid.subscription;
const UNPAID_SESSION_ID = DEMO_FIXTURE_IDS.unpaid.session;
const UNPAID_ASSESSMENT_ID = DEMO_FIXTURE_IDS.unpaid.assessment;
const UNPAID_RESULT_ID = DEMO_FIXTURE_IDS.unpaid.result;
const UNPAID_SUBSCRIPTION_ID = DEMO_FIXTURE_IDS.unpaid.subscription;

const connectionString = process.env.DATABASE_URL;
const tokenSecret = process.env.SESSION_TOKEN_SECRET;
if (!connectionString || !tokenSecret) throw new Error("DATABASE_URL and SESSION_TOKEN_SECRET are required");
const schema = new URL(connectionString).searchParams.get("schema") ?? undefined;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }, schema ? { schema } : undefined) });
const now = new Date();
const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
const calculationDate = "2026-08-05";
const reviewCode = randomBytes(24).toString("base64url");
const paidToken = randomBytes(32).toString("base64url");
const unpaidToken = randomBytes(32).toString("base64url");
const digest = (value: string) => createHmac("sha256", tokenSecret).update(value).digest("hex");

function resultData(assessmentId: string, resultId: string) {
  const calculated = calculateHealthResult({ ageRange: "30_39", sex: "FEMALE", goal: "LOSE_WEIGHT", age: 35, heightCm: 170, weightKg: 80, targetWeightKg: 70, activityLevel: "MODERATE", calculationDate });
  return {
    id: resultId, assessmentId, bmi: calculated.bmi, bmiCategory: calculated.bmiCategory,
    bmrKcal: calculated.bmrKcal, tdeeKcal: calculated.tdeeKcal, recommendedCaloriesKcal: calculated.recommendedCaloriesKcal,
    targetDate: calculated.targetDate ? new Date(`${calculated.targetDate}T00:00:00Z`) : null,
    calculationDate: new Date(`${calculated.calculationDate}T00:00:00Z`), estimatedWeeks: calculated.estimatedWeeks,
    predictionCurve: calculated.predictionCurve.map((point) => ({ ...point })), calorieFloorApplied: calculated.calorieFloorApplied,
    algorithmVersion: calculated.algorithmVersion, createdAt: now,
  };
}

try {
  await prisma.$transaction(async (transaction) => {
    const sessionIds = [PAID_SESSION_ID, UNPAID_SESSION_ID];
    const assessmentIds = (await transaction.assessment.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { id: true },
    })).map(({ id }) => id);
    await transaction.subscription.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await transaction.payment.deleteMany({
      where: { OR: [{ sessionId: { in: sessionIds } }, { assessmentId: { in: assessmentIds } }] },
    });
    await transaction.assessmentResult.deleteMany({ where: { assessmentId: { in: assessmentIds } } });
    await transaction.assessment.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await transaction.session.deleteMany({ where: { id: { in: sessionIds } } });
    await transaction.rateLimitBucket.deleteMany({ where: { scope: "demo-session-exchange" } });

    await transaction.session.create({ data: { id: PAID_SESSION_ID, tokenHash: digest(paidToken), createdAt: now, updatedAt: now, lastSeenAt: now, expiresAt } });
    await transaction.assessment.create({ data: { id: PAID_ASSESSMENT_ID, sessionId: PAID_SESSION_ID, status: "COMPLETED", version: 8, ageRange: "AGE_30_39", sex: "FEMALE", goal: "LOSE_WEIGHT", age: 35, heightCm: 170, weightKg: 80, targetWeightKg: 70, activityLevel: "MODERATE", completedAt: now, createdAt: now, updatedAt: now } });
    await transaction.assessmentResult.create({ data: resultData(PAID_ASSESSMENT_ID, PAID_RESULT_ID) });
    await transaction.payment.create({ data: { id: PAID_PAYMENT_ID, sessionId: PAID_SESSION_ID, assessmentId: PAID_ASSESSMENT_ID, status: "SUCCEEDED", provider: "DEMO", idempotencyKey: "demo_seed_activation_v1", requestFingerprint: PAID_ASSESSMENT_ID, transactionId: "demo_seed_activation_v1", paidAt: now, createdAt: now } });
    await transaction.subscription.create({ data: { id: PAID_SUBSCRIPTION_ID, sessionId: PAID_SESSION_ID, status: "ACTIVE", activatedAt: now, expiresAt: null, activationPaymentId: PAID_PAYMENT_ID, updatedAt: now } });

    await transaction.session.create({ data: { id: UNPAID_SESSION_ID, tokenHash: digest(unpaidToken), createdAt: now, updatedAt: now, lastSeenAt: now, expiresAt } });
    await transaction.assessment.create({ data: { id: UNPAID_ASSESSMENT_ID, sessionId: UNPAID_SESSION_ID, status: "COMPLETED", version: 8, ageRange: "AGE_30_39", sex: "FEMALE", goal: "LOSE_WEIGHT", age: 35, heightCm: 170, weightKg: 80, targetWeightKg: 70, activityLevel: "MODERATE", completedAt: now, createdAt: now, updatedAt: now } });
    await transaction.assessmentResult.create({ data: resultData(UNPAID_ASSESSMENT_ID, UNPAID_RESULT_ID) });
    await transaction.subscription.create({ data: { id: UNPAID_SUBSCRIPTION_ID, sessionId: UNPAID_SESSION_ID, status: "INACTIVE", updatedAt: now } });
  });

  const outputPath = resolve(process.env.DEMO_CREDENTIALS_FILE ?? ".env.demo.generated");
  await writeFile(outputPath, [
    "DEMO_EXCHANGE_ENABLED=true",
    `DEMO_REVIEW_CODE=${reviewCode}`,
    `DEMO_REVIEW_CODE_HASH=${digest(reviewCode)}`,
    `DEMO_PAID_SESSION_TOKEN=${paidToken}`,
    `DEMO_UNPAID_SESSION_TOKEN=${unpaidToken}`,
    "",
  ].join("\n"), { mode: 0o600 });
  console.info(`Demo data reset: paid=1 unpaid=1 credentials=${outputPath}`);
} finally {
  await prisma.$disconnect();
}
