import { globSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeFiles = globSync("app/api/**/route.ts");

describe("Next.js API route architecture", () => {
  it("mounts the deployable health route", () => {
    const healthRoute = "app/api/health/route.ts";
    expect(routeFiles).toContain(healthRoute);
    expect(readFileSync(healthRoute, "utf8")).toMatch(/export\s+\{\s*GET\s*\}/);
  });

  it("prevents any real POST/PATCH route from bypassing the common JSON write guard", () => {
    const unguarded = routeFiles.filter((routeFile) => {
      const source = readFileSync(routeFile, "utf8");
      const exportsWriteMethod =
        /export\s+(?:(?:async\s+)?function|const)\s+(?:POST|PATCH)\b|export\s*\{[^}]*(?:POST|PATCH)[^}]*\}/s.test(
          source,
        );
      return exportsWriteMethod && !source.includes("createJsonWriteRoute");
    });
    expect(unguarded).toEqual([]);
  });
});
