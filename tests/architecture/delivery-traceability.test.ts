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

  it("binds deployment secrets through literal GitHub Environments", () => {
    expect(ciWorkflow).toContain("    name: deployment-preview-acceptance / preview-smoke\n");
    expect(ciWorkflow).toContain("    environment: preview\n");
    expect(ciWorkflow).toContain("    name: deployment-production-acceptance / production-smoke\n");
    expect(ciWorkflow).toContain("    environment: production\n");
    expect(ciWorkflow).toContain("SMOKE_REVIEW_CODE: ${{ secrets.DEMO_REVIEW_CODE }}");
    expect(ciWorkflow).toContain("SMOKE_VERCEL_PROTECTION_BYPASS: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}");
    expect(ciWorkflow).not.toMatch(/^      SMOKE_REVIEW_CODE: \$\{\{ secrets\.DEMO_REVIEW_CODE \}\}/m);
    expect(ciWorkflow.match(/          SMOKE_REVIEW_CODE: \$\{\{ secrets\.DEMO_REVIEW_CODE \}\}/g)).toHaveLength(2);
    expect(ciWorkflow).toContain("test \"$(jq -r '.path' <<<\"$run_json\")\" = .github/workflows/ci.yml");
    expect(ciWorkflow).toContain("test \"$(jq -r '.name' <<<\"$run_json\")\" = CI");
    expect(ciWorkflow).toContain("test \"$(jq -r '.event' <<<\"$run_json\")\" = pull_request");
    expect(ciWorkflow).toContain('select(.name == "deployment-preview-acceptance / preview-smoke")');
    expect(ciWorkflow).not.toContain("uses: ./.github/workflows/deployment-acceptance.yml");
    expect(deploymentWorkflow).toContain("  preview-smoke:\n");
    expect(deploymentWorkflow).toContain("    environment: preview\n");
    expect(deploymentWorkflow).toContain("  production-smoke:\n");
    expect(deploymentWorkflow).toContain("    environment: production\n");
    expect(deploymentWorkflow).not.toContain("environment: ${{ inputs.environment }}");
    expect(deploymentWorkflow).toContain("            preview|production) ;;\n");
    expect(deploymentWorkflow).toContain('            *) echo "Environment must be preview or production" >&2; exit 1 ;;\n');
    expect(deploymentWorkflow).toContain("SMOKE_REVIEW_CODE: ${{ secrets.DEMO_REVIEW_CODE }}");
    expect(deploymentWorkflow).toContain("SMOKE_VERCEL_PROTECTION_BYPASS: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}");
    expect(ciWorkflow).not.toContain("secrets: inherit");
  });
});
