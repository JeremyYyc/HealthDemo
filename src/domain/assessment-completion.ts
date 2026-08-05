import { z } from "zod";
import { ApiError } from "../api/errors.js";

const completeAssessmentSchema = z.object({ version: z.number().int().min(0) }).strict();

export function parseCompleteAssessment(body: unknown): { version: number } {
  const parsed = completeAssessmentSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", {
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        reason: issue.message,
      })),
    });
  }
  return parsed.data;
}
