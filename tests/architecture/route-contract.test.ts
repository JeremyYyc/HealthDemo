import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const routeFiles = globSync("app/api/**/route.ts");

describe("Next.js API route architecture", () => {
  it("mounts the deployable health route", () => {
    const healthRoute = "app/api/health/route.ts";
    expect(routeFiles).toContain(healthRoute);
    expect(readFileSync(healthRoute, "utf8")).toMatch(/export\s+\{\s*GET\s*\}/);
  });

  it("executes every real POST/PATCH export and proves the common Origin guard runs first", async () => {
    for (const routeFile of routeFiles) {
      const routeModule = (await import(/* @vite-ignore */ pathToFileURL(resolve(routeFile)).href)) as Record<
        string,
        unknown
      >;
      for (const method of ["POST", "PATCH"] as const) {
        const handler = routeModule[method];
        if (typeof handler !== "function") continue;
        const response = await handler(
          new Request("https://health.example/api/route-contract", {
            method,
            headers: { "content-type": "application/json" },
            body: "{}",
          }),
        );
        expect(response).toBeInstanceOf(Response);
        expect((response as Response).status, `${method} ${routeFile} bypassed the common write guard`).toBe(403);
        await expect((response as Response).json()).resolves.toMatchObject({
          error: { code: "FORBIDDEN_ORIGIN", requestId: expect.stringMatching(/^req_/) },
        });
      }
    }
  });
});
