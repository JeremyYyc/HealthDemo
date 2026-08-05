import { z } from "zod";
import { ApiError } from "../api/errors.js";

export const STEP_SLUGS = [
  "age-range",
  "sex",
  "goal",
  "age",
  "height",
  "current-weight",
  "target-weight",
  "activity",
] as const;

export type StepSlug = (typeof STEP_SLUGS)[number];
export type StepField =
  | "ageRange"
  | "sex"
  | "goal"
  | "age"
  | "heightCm"
  | "weightKg"
  | "targetWeightKg"
  | "activityLevel";

export interface StepSubmission {
  slug: StepSlug;
  savedStep:
    | "AGE_RANGE"
    | "SEX"
    | "GOAL"
    | "AGE"
    | "HEIGHT"
    | "CURRENT_WEIGHT"
    | "TARGET_WEIGHT"
    | "ACTIVITY_LEVEL";
  field: StepField;
  value: string | number;
  version: number;
}

const version = z.number().int().min(0);
const oneDecimal = (minimum: number, maximum: number) =>
  z
    .number()
    .finite()
    .transform((value, context) => {
      if (Math.abs(value * 10 - Math.round(value * 10)) > 1e-8) {
        context.addIssue({ code: "custom", message: "Must have at most one decimal place." });
        return z.NEVER;
      }
      const normalized = Math.round(value * 10) / 10;
      if (normalized < minimum || normalized > maximum) {
        context.addIssue({ code: "custom", message: `Must be between ${minimum} and ${maximum}.` });
        return z.NEVER;
      }
      return normalized;
    });

const schemas = {
  "age-range": z.object({ ageRange: z.enum(["18_29", "30_39", "40_49", "50_100"]), version }).strict(),
  sex: z.object({ sex: z.enum(["FEMALE", "MALE"]), version }).strict(),
  goal: z.object({ goal: z.enum(["LOSE_WEIGHT", "MAINTAIN_WEIGHT", "GAIN_WEIGHT"]), version }).strict(),
  age: z.object({ age: z.number().int().min(18).max(100), version }).strict(),
  height: z.object({ heightCm: oneDecimal(100, 250), version }).strict(),
  "current-weight": z.object({ weightKg: oneDecimal(30, 350), version }).strict(),
  "target-weight": z.object({ targetWeightKg: oneDecimal(30, 350), version }).strict(),
  activity: z
    .object({ activityLevel: z.enum(["SEDENTARY", "LIGHT", "MODERATE", "ACTIVE", "VERY_ACTIVE"]), version })
    .strict(),
} as const;

const definitions = {
  "age-range": { savedStep: "AGE_RANGE", field: "ageRange" },
  sex: { savedStep: "SEX", field: "sex" },
  goal: { savedStep: "GOAL", field: "goal" },
  age: { savedStep: "AGE", field: "age" },
  height: { savedStep: "HEIGHT", field: "heightCm" },
  "current-weight": { savedStep: "CURRENT_WEIGHT", field: "weightKg" },
  "target-weight": { savedStep: "TARGET_WEIGHT", field: "targetWeightKg" },
  activity: { savedStep: "ACTIVITY_LEVEL", field: "activityLevel" },
} as const;

export function parseStepSubmission(slugValue: string, body: unknown): StepSubmission {
  if (!STEP_SLUGS.includes(slugValue as StepSlug)) {
    throw new ApiError("VALIDATION_ERROR", { details: [{ field: "step", reason: "Unknown assessment step." }] });
  }
  const slug = slugValue as StepSlug;
  const parsed = schemas[slug].safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", {
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        reason: issue.message,
      })),
    });
  }
  const definition = definitions[slug];
  const data = parsed.data as Record<string, string | number> & { version: number };
  return {
    slug,
    savedStep: definition.savedStep,
    field: definition.field,
    value: data[definition.field]!,
    version: data.version,
  };
}

function normalizeConverted(value: number, minimum: number, maximum: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new ApiError("VALIDATION_ERROR", { details: [{ field, reason: "Must be a finite number." }] });
  }
  const normalized = Math.round(value * 10) / 10;
  if (normalized < minimum || normalized > maximum) {
    throw new ApiError("VALIDATION_ERROR", {
      details: [{ field, reason: `Converted value must be between ${minimum} and ${maximum}.` }],
    });
  }
  return normalized;
}

export function imperialHeightToCm(feet: number, inches: number): number {
  if (!Number.isInteger(feet) || !Number.isFinite(inches) || inches < 0 || inches >= 12) {
    throw new ApiError("VALIDATION_ERROR", {
      details: [{ field: "height", reason: "Feet must be an integer and inches must be between 0 and 12." }],
    });
  }
  return normalizeConverted((feet * 12 + inches) * 2.54, 100, 250, "heightCm");
}

export function poundsToKg(pounds: number): number {
  if (typeof pounds !== "number" || !Number.isFinite(pounds) || pounds <= 0) {
    throw new ApiError("VALIDATION_ERROR", { details: [{ field: "pounds", reason: "Must be a positive number." }] });
  }
  return normalizeConverted(pounds * 0.45359237, 30, 350, "weightKg");
}
