import { z } from "zod";
import { ApiError } from "../api/errors.js";

const schema = z.object({ reviewCode: z.string().min(8).max(256) }).strict();

export function parseDemoExchange(body: unknown): { reviewCode: string } {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", { details: parsed.error.issues.map((issue) => ({ field: issue.path.join(".") || "body", reason: issue.message })) });
  return parsed.data;
}
