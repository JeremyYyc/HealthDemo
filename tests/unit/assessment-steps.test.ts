import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/api/errors.js";
import {
  imperialHeightToCm,
  parseStepSubmission,
  poundsToKg,
  type StepSlug,
} from "../../src/domain/assessment-steps.js";

function expectInvalid(step: StepSlug, body: unknown) {
  expect(() => parseStepSubmission(step, body)).toThrowError(
    expect.objectContaining<Partial<ApiError>>({ code: "VALIDATION_ERROR", status: 400 }),
  );
}

describe("P0-03 step domain validation", () => {
  it("P0-03-T01 accepts all eight step boundaries and rejects type, range, precision, and extra fields", () => {
    const accepted: [StepSlug, unknown][] = [
      ["age-range", { ageRange: "18_29", version: 0 }],
      ["sex", { sex: "FEMALE", version: 0 }],
      ["goal", { goal: "GAIN_WEIGHT", version: 0 }],
      ["age", { age: 18, version: 0 }],
      ["age", { age: 100, version: 0 }],
      ["height", { heightCm: 100, version: 0 }],
      ["height", { heightCm: 250, version: 0 }],
      ["current-weight", { weightKg: 30, version: 0 }],
      ["current-weight", { weightKg: 350, version: 0 }],
      ["target-weight", { targetWeightKg: 30, version: 0 }],
      ["target-weight", { targetWeightKg: 350, version: 0 }],
      ["activity", { activityLevel: "VERY_ACTIVE", version: 0 }],
    ];
    for (const [step, body] of accepted) expect(parseStepSubmission(step, body)).toBeDefined();
    for (const ageRange of ["18_29", "30_39", "40_49", "50_100"] as const) {
      expect(parseStepSubmission("age-range", { ageRange, version: 0 })).toBeDefined();
    }
    for (const sex of ["FEMALE", "MALE"] as const) {
      expect(parseStepSubmission("sex", { sex, version: 0 })).toBeDefined();
    }
    for (const goal of ["LOSE_WEIGHT", "MAINTAIN_WEIGHT", "GAIN_WEIGHT"] as const) {
      expect(parseStepSubmission("goal", { goal, version: 0 })).toBeDefined();
    }
    for (const activityLevel of ["SEDENTARY", "LIGHT", "MODERATE", "ACTIVE", "VERY_ACTIVE"] as const) {
      expect(parseStepSubmission("activity", { activityLevel, version: 0 })).toBeDefined();
    }

    const rejected: [StepSlug, unknown][] = [
      ["age-range", { ageRange: "17_29", version: 0 }],
      ["sex", { sex: "OTHER", version: 0 }],
      ["goal", { goal: null, version: 0 }],
      ["age", { age: 17, version: 0 }],
      ["age", { age: 20.5, version: 0 }],
      ["height", { heightCm: 99.9, version: 0 }],
      ["height", { heightCm: 170.55, version: 0 }],
      ["height", { heightCm: Number.NaN, version: 0 }],
      ["current-weight", { weightKg: 350.1, version: 0 }],
      ["current-weight", { weightKg: "80", version: 0 }],
      ["target-weight", { targetWeightKg: Number.POSITIVE_INFINITY, version: 0 }],
      ["activity", { activityLevel: "EXTREME", version: 0 }],
      ["sex", { sex: "MALE", version: -1 }],
      ["sex", { sex: "MALE", version: 0, extra: true }],
    ];
    for (const [step, body] of rejected) expectInvalid(step, body);
  });

  it("P0-03-T07 converts imperial boundary values, normalizes once, and produces metric API values", () => {
    expect(imperialHeightToCm(3, 3.3700787402)).toBe(100);
    expect(imperialHeightToCm(8, 2.4251968504)).toBe(250);
    expect(poundsToKg(66.1386786555)).toBe(30);
    expect(poundsToKg(771.617917647)).toBe(350);
    expect(parseStepSubmission("height", { heightCm: imperialHeightToCm(5, 8), version: 2 })).toMatchObject({
      value: 172.7,
    });
    expect(parseStepSubmission("current-weight", { weightKg: poundsToKg(176.37), version: 3 })).toMatchObject({
      value: 80,
    });
    expect(() => imperialHeightToCm(3, 3.3)).toThrowError(ApiError);
    expect(() => poundsToKg(66)).toThrowError(ApiError);
  });
});
