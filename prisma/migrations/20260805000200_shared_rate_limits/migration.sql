CREATE TABLE "rate_limit_buckets" (
  "id" BIGSERIAL NOT NULL,
  "scope" VARCHAR(64) NOT NULL,
  "key_digest" VARCHAR(64) NOT NULL,
  "window_start" TIMESTAMPTZ(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rate_limit_buckets_scope_key_digest_window_start_key"
  ON "rate_limit_buckets"("scope", "key_digest", "window_start");

CREATE INDEX "rate_limit_buckets_expires_at_idx"
  ON "rate_limit_buckets"("expires_at");
