import { z } from "zod";
import { ApiError } from "../api/errors.js";

const paymentSchema = z.object({
  assessmentId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(128),
}).strict();

export interface DemoPaymentSubmission {
  assessmentId: string;
  idempotencyKey: string;
}

export function parseDemoPayment(body: unknown): DemoPaymentSubmission {
  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", {
      details: parsed.error.issues.map((issue) => ({ field: issue.path.join(".") || "body", reason: issue.message })),
    });
  }
  return parsed.data;
}
