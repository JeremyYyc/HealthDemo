import { describe, expect, it } from "vitest";
import {
  freeResultSchema,
  fullResultSchema,
  resultSummary,
  serializeFreeResult,
} from "../../src/domain/assessment-result.js";

describe("assessment result DTOs", () => {
  it("maps every BMI category to its frozen neutral summary", () => {
    expect(resultSummary("UNDERWEIGHT")).toBe("Your estimated BMI is below the general reference range.");
    expect(resultSummary("NORMAL")).toBe("Your estimated BMI is within the general reference range.");
    expect(resultSummary("OVERWEIGHT")).toBe("Your estimated BMI is above the general reference range.");
    expect(resultSummary("OBESITY")).toBe("Your estimated BMI is well above the general reference range.");
  });

  it("uses strict independent schemas that reject unknown fields", () => {
    const free = serializeFreeResult({
      assessmentId: "8dc46c82-01b5-4fd5-9bc3-80dccb4f319c",
      bmi: 24.9,
      bmiCategory: "NORMAL",
      algorithmVersion: "v1",
    });
    expect(() => freeResultSchema.parse({ ...free, bmrKcal: 1500 })).toThrow();
    expect(() => fullResultSchema.parse({ ...free, accessLevel: "FULL", isLocked: false })).toThrow();
  });
});
