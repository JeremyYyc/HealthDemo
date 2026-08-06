import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const matrix = readFileSync("docs/delivery/p0-acceptance-matrix.md", "utf8");
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
const deploymentWorkflow = readFileSync(".github/workflows/deployment-acceptance.yml", "utf8");

describe("P0-12 delivery traceability", () => {
  it("P0-12-T02 tracks every API and P0 acceptance ID", () => {
    for (let api = 1; api <= 9; api += 1) expect(matrix).toContain(`API-0${api}`);
    const counts = [5, 6, 7, 7, 7, 6, 5, 7, 5, 5, 5, 7];
    for (const [issueIndex, testCount] of counts.entries()) {
      const issue = String(issueIndex + 1).padStart(2, "0");
      for (let testIndex = 1; testIndex <= testCount; testIndex += 1) {
        expect(matrix).toContain(`P0-${issue}-T${String(testIndex).padStart(2, "0")}`);
      }
    }
  });

  it("grants the caller and reusable workflow read-only commit-status access", () => {
    expect(ciWorkflow).toMatch(/permissions:\n(?:  .*\n)*  statuses: read\n/);
    expect(deploymentWorkflow).toMatch(/permissions:\n(?:  .*\n)*  statuses: read\n/);
  });

  it("declares only the two deployment Environment secret names", () => {
    expect(deploymentWorkflow).toContain("    secrets:\n      DEMO_REVIEW_CODE:\n");
    expect(deploymentWorkflow).toContain("      VERCEL_AUTOMATION_BYPASS_SECRET:\n");
    expect(ciWorkflow).not.toContain("secrets: inherit");
  });
});
