import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { ApiError } from "../../src/api/errors.js";
import { PrismaDatabaseHealthProbe } from "../../src/api/health.js";
import { errorResponse } from "../../src/api/http.js";
import { enforceRateLimit, PrismaRateLimitStore, type RateLimitPolicy } from "../../src/api/rate-limit.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests");

const schemaName = `p0_10_${randomUUID().replaceAll("-", "")}`;
const isolatedUrl = new URL(databaseUrl);
isolatedUrl.searchParams.set("schema", schemaName);

function createClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: isolatedUrl.toString() }, { schema: schemaName }),
  });
}

const firstClient = createClient();
const secondClient = createClient();

beforeAll(() => {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
    stdio: "pipe",
  });
});

afterAll(async () => {
  await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
});

describe("P0-10 PostgreSQL-backed API infrastructure", () => {
  it("P0-10-T04 shares counters across client instances, hashes keys, and returns integer Retry-After", async () => {
    const policy: RateLimitPolicy = { scope: "integration-test", limit: 2, windowSeconds: 60 };
    const common = {
      policy,
      key: "203.0.113.42",
      digestSecret: "integration-only-rate-secret",
      now: new Date("2026-08-05T12:00:30.250Z"),
    };

    await enforceRateLimit({ ...common, store: new PrismaRateLimitStore(firstClient) });
    await enforceRateLimit({ ...common, store: new PrismaRateLimitStore(secondClient) });

    let limited: ApiError | undefined;
    try {
      await enforceRateLimit({ ...common, store: new PrismaRateLimitStore(firstClient) });
    } catch (error) {
      limited = error as ApiError;
    }
    expect(limited).toMatchObject({ code: "RATE_LIMITED", status: 429, headers: { "retry-after": "30" } });
    const response = errorResponse(limited, { requestId: "req_rate" });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toMatch(/^\d+$/);

    const rows = await secondClient.rateLimitBucket.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ scope: "integration-test", count: 3 });
    expect(rows[0]?.keyDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(rows[0]?.keyDigest).not.toContain(common.key);

    const concurrentPolicy: RateLimitPolicy = { scope: "concurrent-test", limit: 20, windowSeconds: 60 };
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        enforceRateLimit({
          ...common,
          policy: concurrentPolicy,
          store: new PrismaRateLimitStore(index % 2 === 0 ? firstClient : secondClient),
        }),
      ),
    );
    const concurrent = await firstClient.rateLimitBucket.findFirstOrThrow({
      where: { scope: concurrentPolicy.scope },
    });
    expect(concurrent.count).toBe(20);
  });

  it("P0-10-T05 health probe reads the database without writing sessions or rate-limit state", async () => {
    const before = {
      sessions: await firstClient.session.count(),
      buckets: await firstClient.rateLimitBucket.count(),
    };
    await new PrismaDatabaseHealthProbe(firstClient).check();
    const after = {
      sessions: await firstClient.session.count(),
      buckets: await firstClient.rateLimitBucket.count(),
    };
    expect(after).toEqual(before);
  });
});
