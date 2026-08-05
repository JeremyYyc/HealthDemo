export const ALGORITHM_VERSION = "v1" as const;
export const CALORIE_FLOOR_KCAL = 1200;
export const HEALTH_DISCLAIMER =
  "This estimate is for demonstration only and is not medical, nutritional, or diagnostic advice.";

export const AGE_RANGES = ["18_29", "30_39", "40_49", "50_100"] as const;
export const SEXES = ["FEMALE", "MALE"] as const;
export const GOALS = ["LOSE_WEIGHT", "MAINTAIN_WEIGHT", "GAIN_WEIGHT"] as const;
export const ACTIVITY_LEVELS = ["SEDENTARY", "LIGHT", "MODERATE", "ACTIVE", "VERY_ACTIVE"] as const;

export type AgeRange = (typeof AGE_RANGES)[number];
export type Sex = (typeof SEXES)[number];
export type Goal = (typeof GOALS)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export type BmiCategory = "UNDERWEIGHT" | "NORMAL" | "OVERWEIGHT" | "OBESITY";

export interface HealthCalculationInput {
  ageRange: AgeRange;
  sex: Sex;
  goal: Goal;
  age: number;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  activityLevel: ActivityLevel;
  calculationDate: string;
}

export interface PredictionPoint {
  week: number;
  date: string;
  weightKg: number;
}

export interface HealthCalculationResult {
  bmi: number;
  bmiCategory: BmiCategory;
  bmrKcal: number;
  tdeeKcal: number;
  recommendedCaloriesKcal: number;
  targetDate: string | null;
  calculationDate: string;
  estimatedWeeks: number;
  predictionCurve: PredictionPoint[];
  calorieFloorApplied: boolean;
  algorithmVersion: typeof ALGORITHM_VERSION;
  disclaimer: typeof HEALTH_DISCLAIMER;
}

export type HealthCalculationErrorCode = "INVALID_INPUT" | "BUSINESS_RULE_VIOLATION";

export class HealthCalculationError extends Error {
  readonly code: HealthCalculationErrorCode;
  readonly field: keyof HealthCalculationInput;
  readonly reason: string;

  constructor(code: HealthCalculationErrorCode, field: keyof HealthCalculationInput, reason: string) {
    super(reason);
    this.name = "HealthCalculationError";
    this.code = code;
    this.field = field;
    this.reason = reason;
  }
}

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
};

const AGE_RANGE_BOUNDS: Record<AgeRange, readonly [number, number]> = {
  "18_29": [18, 29],
  "30_39": [30, 39],
  "40_49": [40, 49],
  "50_100": [50, 100],
};

function invalid(field: keyof HealthCalculationInput, reason: string): never {
  throw new HealthCalculationError("INVALID_INPUT", field, reason);
}

function businessRule(field: keyof HealthCalculationInput, reason: string): never {
  throw new HealthCalculationError("BUSINESS_RULE_VIOLATION", field, reason);
}

function assertEnum<T extends string>(
  field: keyof HealthCalculationInput,
  value: unknown,
  allowed: readonly T[],
): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    invalid(field, `${field} must be one of: ${allowed.join(", ")}`);
  }
}

function assertFiniteNumber(
  field: "heightCm" | "weightKg" | "targetWeightKg",
  value: unknown,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalid(field, `${field} must be a finite number`);
  }
  if (value < minimum || value > maximum) {
    invalid(field, `${field} must be between ${minimum} and ${maximum}`);
  }
  if (Math.abs(value * 10 - Math.round(value * 10)) > 1e-8) {
    invalid(field, `${field} must have at most one decimal place`);
  }
}

function parseUtcDateOnly(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid("calculationDate", "calculationDate must use YYYY-MM-DD UTC date-only format");
  }
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (formatUtcDate(parsed) !== value) {
    invalid("calculationDate", "calculationDate must be a real UTC calendar date");
  }
  return parsed;
}

function formatUtcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): string {
  return formatUtcDate(new Date(date.getTime() + days * 86_400_000));
}

function roundToOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function classifyBmi(bmi: number): BmiCategory {
  if (!Number.isFinite(bmi) || bmi < 0) {
    invalid("weightKg", "BMI must be a finite non-negative number");
  }
  if (bmi < 18.5) return "UNDERWEIGHT";
  if (bmi < 25) return "NORMAL";
  if (bmi < 30) return "OVERWEIGHT";
  return "OBESITY";
}

export function validateHealthCalculationInput(input: HealthCalculationInput): void {
  if (!input || typeof input !== "object") {
    invalid("ageRange", "input must be an object");
  }
  assertEnum("ageRange", input.ageRange, AGE_RANGES);
  assertEnum("sex", input.sex, SEXES);
  assertEnum("goal", input.goal, GOALS);
  assertEnum("activityLevel", input.activityLevel, ACTIVITY_LEVELS);

  if (typeof input.age !== "number" || !Number.isFinite(input.age) || !Number.isInteger(input.age)) {
    invalid("age", "age must be a finite integer");
  }
  if (input.age < 18 || input.age > 100) {
    invalid("age", "age must be between 18 and 100");
  }
  const [minimumAge, maximumAge] = AGE_RANGE_BOUNDS[input.ageRange];
  if (input.age < minimumAge || input.age > maximumAge) {
    businessRule("age", "age must fall within ageRange");
  }

  assertFiniteNumber("heightCm", input.heightCm, 100, 250);
  assertFiniteNumber("weightKg", input.weightKg, 30, 350);
  assertFiniteNumber("targetWeightKg", input.targetWeightKg, 30, 350);
  parseUtcDateOnly(input.calculationDate);

  const difference = input.targetWeightKg - input.weightKg;
  if (input.goal === "LOSE_WEIGHT" && difference >= 0) {
    businessRule("targetWeightKg", "target weight must be below current weight for a weight-loss goal");
  }
  if (input.goal === "GAIN_WEIGHT" && difference <= 0) {
    businessRule("targetWeightKg", "target weight must be above current weight for a weight-gain goal");
  }
  if (input.goal === "MAINTAIN_WEIGHT" && Math.abs(difference) > 2) {
    businessRule("targetWeightKg", "maintenance target must be within 2 kg of current weight");
  }

  const heightMeters = input.heightCm / 100;
  const targetBmi = input.targetWeightKg / heightMeters ** 2;
  if (targetBmi < 15 || targetBmi > 50) {
    businessRule("targetWeightKg", "target BMI must be between 15 and 50");
  }

  if (input.goal !== "MAINTAIN_WEIGHT") {
    const weeklyRateHundredths = input.goal === "LOSE_WEIGHT" ? 50 : 25;
    const differenceHundredths = Math.abs(
      Math.round(input.targetWeightKg * 100) - Math.round(input.weightKg * 100),
    );
    if (Math.ceil(differenceHundredths / weeklyRateHundredths) > 104) {
      businessRule("targetWeightKg", "target timeline must not exceed 104 weeks");
    }
  }
}

export function calculateHealthResult(input: HealthCalculationInput): HealthCalculationResult {
  validateHealthCalculationInput(input);
  const calculationDate = parseUtcDateOnly(input.calculationDate);
  const heightMeters = input.heightCm / 100;
  const rawBmi = input.weightKg / heightMeters ** 2;
  const rawBmr =
    10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + (input.sex === "MALE" ? 5 : -161);
  const rawTdee = rawBmr * ACTIVITY_FACTORS[input.activityLevel];
  const calorieAdjustment = input.goal === "LOSE_WEIGHT" ? -500 : input.goal === "GAIN_WEIGHT" ? 300 : 0;
  const rawRecommendation = rawTdee + calorieAdjustment;
  const calorieFloorApplied = rawRecommendation < CALORIE_FLOOR_KCAL;

  let estimatedWeeks = 0;
  let targetDate: string | null = null;
  const predictionCurve: PredictionPoint[] = [
    { week: 0, date: input.calculationDate, weightKg: roundToOneDecimal(input.weightKg) },
  ];

  if (input.goal !== "MAINTAIN_WEIGHT") {
    const direction = input.goal === "LOSE_WEIGHT" ? -1 : 1;
    const weeklyRateHundredths = input.goal === "LOSE_WEIGHT" ? 50 : 25;
    const currentHundredths = Math.round(input.weightKg * 100);
    const targetHundredths = Math.round(input.targetWeightKg * 100);
    estimatedWeeks = Math.ceil(Math.abs(targetHundredths - currentHundredths) / weeklyRateHundredths);
    targetDate = addUtcDays(calculationDate, estimatedWeeks * 7);

    for (let week = 1; week <= estimatedWeeks; week += 1) {
      const projectedHundredths = currentHundredths + direction * weeklyRateHundredths * week;
      const boundedHundredths =
        direction < 0
          ? Math.max(projectedHundredths, targetHundredths)
          : Math.min(projectedHundredths, targetHundredths);
      predictionCurve.push({
        week,
        date: addUtcDays(calculationDate, week * 7),
        weightKg: week === estimatedWeeks ? input.targetWeightKg : roundToOneDecimal(boundedHundredths / 100),
      });
    }
  }

  return {
    bmi: roundToOneDecimal(rawBmi),
    bmiCategory: classifyBmi(rawBmi),
    bmrKcal: Math.round(rawBmr),
    tdeeKcal: Math.round(rawTdee),
    recommendedCaloriesKcal: Math.round(Math.max(CALORIE_FLOOR_KCAL, rawRecommendation)),
    targetDate,
    calculationDate: input.calculationDate,
    estimatedWeeks,
    predictionCurve,
    calorieFloorApplied,
    algorithmVersion: ALGORITHM_VERSION,
    disclaimer: HEALTH_DISCLAIMER,
  };
}
