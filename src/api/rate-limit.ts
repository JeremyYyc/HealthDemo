import type { PrismaClient } from "../generated/prisma/client.js";
import { digestOpaqueValue } from "./auth.js";
import { ApiError } from "./errors.js";

export interface RateLimitPolicy {
  scope: string;
  limit: number;
  windowSeconds: number;
}

export const PAY_RATE_LIMIT: RateLimitPolicy = { scope: "pay", limit: 10, windowSeconds: 60 };
export const DEMO_EXCHANGE_RATE_LIMIT: RateLimitPolicy = {
  scope: "demo-session-exchange",
  limit: 5,
  windowSeconds: 15 * 60,
};

export interface RateLimitIncrement {
  count: number;
  expiresAt: Date;
}

export interface SharedRateLimitStore {
  increment(input: {
    scope: string;
    keyDigest: string;
    windowStart: Date;
    expiresAt: Date;
  }): Promise<RateLimitIncrement>;
}

export class PrismaRateLimitStore implements SharedRateLimitStore {
  constructor(private readonly prisma: PrismaClient) {}

  async increment(input: {
    scope: string;
    keyDigest: string;
    windowStart: Date;
    expiresAt: Date;
  }): Promise<RateLimitIncrement> {
    return this.prisma.rateLimitBucket.upsert({
      where: {
        scope_keyDigest_windowStart: {
          scope: input.scope,
          keyDigest: input.keyDigest,
          windowStart: input.windowStart,
        },
      },
      create: input,
      update: { count: { increment: 1 }, expiresAt: input.expiresAt },
      select: { count: true, expiresAt: true },
    });
  }
}

function validatePolicy(policy: RateLimitPolicy): void {
  if (!policy.scope || !Number.isInteger(policy.limit) || policy.limit < 1) {
    throw new Error("Rate limit policy must have a scope and positive integer limit");
  }
  if (!Number.isInteger(policy.windowSeconds) || policy.windowSeconds < 1) {
    throw new Error("Rate limit windowSeconds must be a positive integer");
  }
}

export async function enforceRateLimit(input: {
  store: SharedRateLimitStore;
  policy: RateLimitPolicy;
  key: string;
  digestSecret: string;
  now?: Date;
}): Promise<void> {
  validatePolicy(input.policy);
  const now = input.now ?? new Date();
  const windowMilliseconds = input.policy.windowSeconds * 1000;
  const windowStartMilliseconds = Math.floor(now.getTime() / windowMilliseconds) * windowMilliseconds;
  const windowStart = new Date(windowStartMilliseconds);
  const expiresAt = new Date(windowStartMilliseconds + windowMilliseconds);
  const result = await input.store.increment({
    scope: input.policy.scope,
    keyDigest: digestOpaqueValue(input.key, input.digestSecret),
    windowStart,
    expiresAt,
  });

  if (result.count > input.policy.limit) {
    const retryAfter = Math.max(1, Math.ceil((result.expiresAt.getTime() - now.getTime()) / 1000));
    throw new ApiError("RATE_LIMITED", { headers: { "retry-after": String(retryAfter) } });
  }
}
