import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/api/errors.js";
import { parseDemoPayment } from "../../src/domain/demo-payment.js";

const assessmentId = "8dc46c82-01b5-4fd5-9bc3-80dccb4f319c";

describe("Demo payment request", () => {
  it("accepts only an Assessment ID and an 8–128 character key", () => {
    expect(parseDemoPayment({ assessmentId, idempotencyKey: "12345678" })).toEqual({ assessmentId, idempotencyKey: "12345678" });
    expect(parseDemoPayment({ assessmentId, idempotencyKey: "x".repeat(128) }).idempotencyKey).toHaveLength(128);
    for (const key of ["1234567", "x".repeat(129)]) {
      expect(() => parseDemoPayment({ assessmentId, idempotencyKey: key })).toThrow(ApiError);
    }
  });

  it("strictly rejects client-supplied Session or subscription state", () => {
    expect(() => parseDemoPayment({ assessmentId, idempotencyKey: "12345678", sessionId: assessmentId })).toThrow(ApiError);
    expect(() => parseDemoPayment({ assessmentId, idempotencyKey: "12345678", subscriptionStatus: "ACTIVE" })).toThrow(ApiError);
  });
});
