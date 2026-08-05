import { z } from "zod";

export const RESULT_DISCLAIMER =
  "This assessment is a general wellness estimate for demonstration purposes. It is not medical advice, diagnosis, or a substitute for professional care.";

export const UNLOCKABLE_SECTIONS = ["Daily calorie target", "Goal timeline", "Progress forecast"] as const;

const bmiCategory = z.enum(["UNDERWEIGHT", "NORMAL", "OVERWEIGHT", "OBESITY"]);
const predictionPoint = z.object({
  week: z.number().int().min(0),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weightKg: z.number(),
}).strict();

const publicFields = {
  assessmentId: z.string().uuid(),
  bmi: z.number(),
  bmiCategory,
  summary: z.string(),
  algorithmVersion: z.string(),
  disclaimer: z.literal(RESULT_DISCLAIMER),
} as const;

export const freeResultSchema = z.object({
  ...publicFields,
  accessLevel: z.literal("FREE"),
  isLocked: z.literal(true),
  unlockableSections: z.tuple([
    z.literal(UNLOCKABLE_SECTIONS[0]),
    z.literal(UNLOCKABLE_SECTIONS[1]),
    z.literal(UNLOCKABLE_SECTIONS[2]),
  ]),
}).strict();

export const fullResultSchema = z.object({
  ...publicFields,
  accessLevel: z.literal("FULL"),
  isLocked: z.literal(false),
  unlockableSections: z.tuple([]),
  bmrKcal: z.number().int(),
  tdeeKcal: z.number().int(),
  recommendedCaloriesKcal: z.number().int(),
  estimatedWeeks: z.number().int().min(0),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  calculationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  predictionCurve: z.array(predictionPoint),
  calorieFloorApplied: z.boolean(),
}).strict();

export type FreeResultDto = z.infer<typeof freeResultSchema>;
export type FullResultDto = z.infer<typeof fullResultSchema>;
export type AssessmentResultDto = FreeResultDto | FullResultDto;

const SUMMARY_BY_CATEGORY: Record<z.infer<typeof bmiCategory>, string> = {
  UNDERWEIGHT: "Your estimated BMI is below the general reference range.",
  NORMAL: "Your estimated BMI is within the general reference range.",
  OVERWEIGHT: "Your estimated BMI is above the general reference range.",
  OBESITY: "Your estimated BMI is well above the general reference range.",
};

export function resultSummary(category: z.infer<typeof bmiCategory>): string {
  return SUMMARY_BY_CATEGORY[category];
}

export function serializeFreeResult(input: {
  assessmentId: string;
  bmi: number;
  bmiCategory: z.infer<typeof bmiCategory>;
  algorithmVersion: string;
}): FreeResultDto {
  return freeResultSchema.parse({
    assessmentId: input.assessmentId,
    accessLevel: "FREE",
    bmi: input.bmi,
    bmiCategory: input.bmiCategory,
    summary: resultSummary(input.bmiCategory),
    isLocked: true,
    unlockableSections: UNLOCKABLE_SECTIONS,
    algorithmVersion: input.algorithmVersion,
    disclaimer: RESULT_DISCLAIMER,
  });
}

export function serializeFullResult(input: {
  assessmentId: string;
  bmi: number;
  bmiCategory: z.infer<typeof bmiCategory>;
  algorithmVersion: string;
  bmrKcal: number;
  tdeeKcal: number;
  recommendedCaloriesKcal: number;
  estimatedWeeks: number;
  targetDate: string | null;
  calculationDate: string;
  predictionCurve: unknown;
  calorieFloorApplied: boolean;
}): FullResultDto {
  return fullResultSchema.parse({
    assessmentId: input.assessmentId,
    accessLevel: "FULL",
    bmi: input.bmi,
    bmiCategory: input.bmiCategory,
    summary: resultSummary(input.bmiCategory),
    isLocked: false,
    unlockableSections: [],
    algorithmVersion: input.algorithmVersion,
    disclaimer: RESULT_DISCLAIMER,
    bmrKcal: input.bmrKcal,
    tdeeKcal: input.tdeeKcal,
    recommendedCaloriesKcal: input.recommendedCaloriesKcal,
    estimatedWeeks: input.estimatedWeeks,
    targetDate: input.targetDate,
    calculationDate: input.calculationDate,
    predictionCurve: input.predictionCurve,
    calorieFloorApplied: input.calorieFloorApplied,
  });
}
