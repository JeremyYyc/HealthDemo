CREATE TYPE "AssessmentStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');
CREATE TYPE "AgeRange" AS ENUM ('18_29', '30_39', '40_49', '50_100');
CREATE TYPE "Sex" AS ENUM ('FEMALE', 'MALE');
CREATE TYPE "Goal" AS ENUM ('LOSE_WEIGHT', 'MAINTAIN_WEIGHT', 'GAIN_WEIGHT');
CREATE TYPE "ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE');
CREATE TYPE "BmiCategory" AS ENUM ('UNDERWEIGHT', 'NORMAL', 'OVERWEIGHT', 'OBESITY');
CREATE TYPE "SubscriptionStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'EXPIRED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "PaymentProvider" AS ENUM ('DEMO');

CREATE TABLE "sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "token_hash" VARCHAR(128) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_id" UUID NOT NULL,
  "status" "AssessmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "version" INTEGER NOT NULL DEFAULT 0,
  "age_range" "AgeRange",
  "sex" "Sex",
  "goal" "Goal",
  "age" INTEGER,
  "height_cm" DECIMAL(5,1),
  "weight_kg" DECIMAL(5,1),
  "target_weight_kg" DECIMAL(5,1),
  "activity_level" "ActivityLevel",
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "assessment_id" UUID NOT NULL,
  "bmi" DECIMAL(4,1) NOT NULL,
  "bmi_category" "BmiCategory" NOT NULL,
  "bmr_kcal" INTEGER NOT NULL,
  "tdee_kcal" INTEGER NOT NULL,
  "recommended_calories_kcal" INTEGER NOT NULL,
  "target_date" DATE,
  "calculation_date" DATE NOT NULL,
  "estimated_weeks" INTEGER NOT NULL,
  "prediction_curve" JSONB NOT NULL,
  "calorie_floor_applied" BOOLEAN NOT NULL,
  "algorithm_version" VARCHAR(32) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_id" UUID NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
  "activated_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3),
  "activation_payment_id" UUID,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_id" UUID NOT NULL,
  "assessment_id" UUID NOT NULL,
  "status" "PaymentStatus" NOT NULL,
  "provider" "PaymentProvider" NOT NULL DEFAULT 'DEMO',
  "idempotency_key" VARCHAR(128) NOT NULL,
  "request_fingerprint" VARCHAR(128) NOT NULL,
  "transaction_id" VARCHAR(128) NOT NULL,
  "paid_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "assessments_session_id_status_idx" ON "assessments"("session_id", "status");
CREATE UNIQUE INDEX "assessment_results_assessment_id_key" ON "assessment_results"("assessment_id");
CREATE UNIQUE INDEX "subscriptions_session_id_key" ON "subscriptions"("session_id");
CREATE UNIQUE INDEX "subscriptions_activation_payment_id_key" ON "subscriptions"("activation_payment_id");
CREATE UNIQUE INDEX "payments_transaction_id_key" ON "payments"("transaction_id");
CREATE UNIQUE INDEX "payments_session_id_idempotency_key_key" ON "payments"("session_id", "idempotency_key");
CREATE INDEX "payments_assessment_id_idx" ON "payments"("assessment_id");

ALTER TABLE "assessments" ADD CONSTRAINT "assessments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_activation_payment_id_fkey" FOREIGN KEY ("activation_payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
