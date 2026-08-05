import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const matrix = readFileSync("docs/delivery/p0-acceptance-matrix.md", "utf8");

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
});
