import { describe, expect, it } from "vitest";
import { isExpectedDeploymentVersion } from "../../scripts/smoke-deployment.mjs";

describe("deployment smoke provenance", () => {
  it("P0-12-T06 rejects a healthy deployment that is not the expected commit", async () => {
    expect(isExpectedDeploymentVersion("old-commit", "expected-full-commit-sha")).toBe(false);
    expect(isExpectedDeploymentVersion("expected-full-commit-sha", "expected-full-commit-sha")).toBe(true);
    expect(isExpectedDeploymentVersion("local", undefined)).toBe(true);
  });
});
