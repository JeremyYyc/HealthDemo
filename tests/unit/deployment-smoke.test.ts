import { describe, expect, it } from "vitest";
import {
  deploymentProtectionHeaders,
  isExpectedDeploymentVersion,
} from "../../scripts/smoke-deployment.mjs";

describe("deployment smoke provenance", () => {
  it("P0-12-T06 rejects a healthy deployment that is not the expected commit", async () => {
    expect(isExpectedDeploymentVersion("old-commit", "expected-full-commit-sha")).toBe(false);
    expect(isExpectedDeploymentVersion("expected-full-commit-sha", "expected-full-commit-sha")).toBe(true);
    expect(isExpectedDeploymentVersion("local", undefined)).toBe(true);
  });

  it("adds the Vercel automation bypass only when explicitly configured", () => {
    expect(deploymentProtectionHeaders(undefined)).toEqual({});
    expect(deploymentProtectionHeaders("deployment-secret")).toEqual({
      "x-vercel-protection-bypass": "deployment-secret",
    });
  });
});
