import { describe, expect, it } from "vitest";
import {
  calculateHealthResult,
  classifyBmi,
  HealthCalculationError,
  type HealthCalculationInput,
} from "../../src/domain/health-calculation.js";

const baseInput: HealthCalculationInput = {
  ageRange: "30_39",
  sex: "MALE",
  goal: "LOSE_WEIGHT",
  age: 35,
  heightCm: 180,
  weightKg: 80,
  targetWeightKg: 75,
  activityLevel: "MODERATE",
  calculationDate: "2026-08-05",
};

function calculate(overrides: Partial<HealthCalculationInput> = {}) {
  return calculateHealthResult({ ...baseInput, ...overrides });
}

function expectError(
  overrides: Partial<HealthCalculationInput>,
  field: keyof HealthCalculationInput,
  code: "INVALID_INPUT" | "BUSINESS_RULE_VIOLATION" = "INVALID_INPUT",
) {
  expect(() => calculate(overrides)).toThrowError(
    expect.objectContaining<Partial<HealthCalculationError>>({ name: "HealthCalculationError", field, code }),
  );
}

describe("P0-05 health calculation engine v1", () => {
  it("P0-05-T01 applies both Mifflin–St Jeor constants and all five activity factors", () => {
    expect(calculate({ sex: "MALE", activityLevel: "SEDENTARY" })).toMatchObject({ bmrKcal: 1755, tdeeKcal: 2106 });
    expect(calculate({ sex: "FEMALE", activityLevel: "LIGHT" })).toMatchObject({ bmrKcal: 1589, tdeeKcal: 2185 });
    expect(calculate({ activityLevel: "MODERATE" }).tdeeKcal).toBe(2720);
    expect(calculate({ activityLevel: "ACTIVE" }).tdeeKcal).toBe(3027);
    expect(calculate({ activityLevel: "VERY_ACTIVE" }).tdeeKcal).toBe(3335);
  });

  it("P0-05-T02 accepts numeric boundaries and rejects invalid age, height, weight, NaN, and Infinity", () => {
    for (const [ageRange, age] of [
      ["18_29", 18],
      ["18_29", 29],
      ["30_39", 30],
      ["30_39", 39],
      ["40_49", 40],
      ["40_49", 49],
      ["50_100", 50],
      ["50_100", 100],
    ] as const) {
      expect(calculate({ ageRange, age })).toBeDefined();
    }
    expect(calculate({ ageRange: "18_29", goal: "MAINTAIN_WEIGHT", age: 18, heightCm: 100, weightKg: 30, targetWeightKg: 30 })).toBeDefined();
    expect(calculate({ ageRange: "50_100", age: 100, heightCm: 250, weightKg: 350, targetWeightKg: 300 })).toBeDefined();
    expectError({ ageRange: "18_29", age: 17 }, "age");
    expectError({ ageRange: "50_100", age: 101 }, "age");
    expectError({ age: 20.5 }, "age");
    expectError({ age: Number.NaN }, "age");
    expectError({ heightCm: 99.9 }, "heightCm");
    expectError({ heightCm: 250.1 }, "heightCm");
    expectError({ heightCm: Number.POSITIVE_INFINITY }, "heightCm");
    expectError({ weightKg: 29.9 }, "weightKg");
    expectError({ weightKg: 350.1 }, "weightKg");
    expectError({ targetWeightKg: 74.55 }, "targetWeightKg");
    expectError({ ageRange: "18_29", age: 35 }, "age", "BUSINESS_RULE_VIOLATION");
  });

  it("P0-05-T03 classifies exact BMI boundaries and displays one decimal", () => {
    expect(classifyBmi(18.499)).toBe("UNDERWEIGHT");
    expect(classifyBmi(18.5)).toBe("NORMAL");
    expect(classifyBmi(25)).toBe("OVERWEIGHT");
    expect(classifyBmi(30)).toBe("OBESITY");
    expect(calculate().bmi).toBe(24.7);
  });

  it("P0-05-T04 enforces goal direction, maintenance tolerance, target BMI, and 104-week limit", () => {
    expectError({ goal: "LOSE_WEIGHT", targetWeightKg: 80 }, "targetWeightKg", "BUSINESS_RULE_VIOLATION");
    expectError({ goal: "GAIN_WEIGHT", targetWeightKg: 79.9 }, "targetWeightKg", "BUSINESS_RULE_VIOLATION");
    expect(calculate({ goal: "MAINTAIN_WEIGHT", targetWeightKg: 82 })).toMatchObject({ estimatedWeeks: 0 });
    expectError({ goal: "MAINTAIN_WEIGHT", targetWeightKg: 82.1 }, "targetWeightKg", "BUSINESS_RULE_VIOLATION");
    expectError({ heightCm: 200, weightKg: 80, targetWeightKg: 59.9 }, "targetWeightKg", "BUSINESS_RULE_VIOLATION");
    expectError(
      { goal: "GAIN_WEIGHT", heightCm: 100, weightKg: 30, targetWeightKg: 56.1 },
      "targetWeightKg",
      "BUSINESS_RULE_VIOLATION",
    );
    expect(calculate({ goal: "GAIN_WEIGHT", weightKg: 80, targetWeightKg: 106 })).toMatchObject({ estimatedWeeks: 104 });
    expectError(
      { goal: "GAIN_WEIGHT", weightKg: 80, targetWeightKg: 106.1 },
      "targetWeightKg",
      "BUSINESS_RULE_VIOLATION",
    );
  });

  it("P0-05-T05 uses Math.round-equivalent .5 behavior and the exact calorie-floor predicate", () => {
    const halfBmr = calculate({ sex: "MALE", ageRange: "30_39", age: 34, heightCm: 170, weightKg: 80 });
    expect(halfBmr.bmrKcal).toBe(1698);

    const halfRecommendation = calculate({
      sex: "MALE",
      ageRange: "18_29",
      age: 18,
      heightCm: 100,
      weightKg: 35.5,
      targetWeightKg: 30,
      activityLevel: "VERY_ACTIVE",
    });
    expect(halfRecommendation).toMatchObject({
      tdeeKcal: 1701,
      recommendedCaloriesKcal: 1201,
      calorieFloorApplied: false,
    });

    const exactlyFloor = calculate({
      sex: "FEMALE",
      goal: "MAINTAIN_WEIGHT",
      ageRange: "50_100",
      age: 50,
      heightCm: 160,
      weightKg: 41.1,
      targetWeightKg: 41.1,
      activityLevel: "SEDENTARY",
    });
    expect(exactlyFloor).toMatchObject({ recommendedCaloriesKcal: 1200, calorieFloorApplied: false });

    const belowFloor = calculate({ sex: "FEMALE", ageRange: "50_100", age: 100, heightCm: 150, weightKg: 40, targetWeightKg: 39, activityLevel: "SEDENTARY" });
    expect(belowFloor).toMatchObject({ recommendedCaloriesKcal: 1200, calorieFloorApplied: true });
  });

  it("P0-05-T06 handles UTC month/year/leap transitions, maintenance, endpoints, and 105-point maximum", () => {
    const leap = calculate({ calculationDate: "2028-02-25", weightKg: 80, targetWeightKg: 79.5 });
    expect(leap).toMatchObject({ estimatedWeeks: 1, targetDate: "2028-03-03" });
    expect(leap.predictionCurve.at(-1)).toEqual({ week: 1, date: "2028-03-03", weightKg: 79.5 });

    const year = calculate({ calculationDate: "2026-12-30", weightKg: 80, targetWeightKg: 79 });
    expect(year.targetDate).toBe("2027-01-13");

    const daylightSavingBoundary = calculate({ calculationDate: "2026-03-07", weightKg: 80, targetWeightKg: 79.5 });
    expect(daylightSavingBoundary.targetDate).toBe("2026-03-14");

    const maintenance = calculate({ goal: "MAINTAIN_WEIGHT", targetWeightKg: 81.9 });
    expect(maintenance).toMatchObject({ targetDate: null, estimatedWeeks: 0 });
    expect(maintenance.predictionCurve).toEqual([{ week: 0, date: "2026-08-05", weightKg: 80 }]);

    const maximum = calculate({ goal: "GAIN_WEIGHT", weightKg: 80, targetWeightKg: 106 });
    expect(maximum.predictionCurve).toHaveLength(105);
    expect(maximum.predictionCurve.at(-1)?.weightKg).toBe(106);
    expectError({ calculationDate: "2026-02-29" }, "calculationDate");
  });

  it("P0-05-T07 is deterministic for fixed normalized input, date, and version", () => {
    const first = calculate();
    const second = calculate();
    expect(second).toEqual(first);
    expect(first.algorithmVersion).toBe("v1");
    expect(first.disclaimer).toContain("not medical");
  });
});
