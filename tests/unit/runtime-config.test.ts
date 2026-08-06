import { describe, expect, it } from "vitest";
import { resolveAppBaseUrl, resolveAppVersion } from "../../src/api/runtime-config.js";

describe("runtime deployment configuration", () => {
  it("keeps explicit application configuration authoritative", () => {
    expect(
      resolveAppBaseUrl({
        APP_BASE_URL: "https://custom.example",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "health-demo.vercel.app",
      }),
    ).toBe("https://custom.example");
    expect(resolveAppVersion({ APP_VERSION: "release-42", VERCEL_GIT_COMMIT_SHA: "abc123" })).toBe(
      "release-42",
    );
  });

  it("uses the stable Vercel production domain in production", () => {
    expect(
      resolveAppBaseUrl({
        VERCEL_ENV: "production",
        VERCEL_BRANCH_URL: "health-demo-git-main.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "health-demo.example",
      }),
    ).toBe("https://health-demo.example");
  });

  it("uses the stable Vercel branch domain for previews", () => {
    expect(
      resolveAppBaseUrl({
        VERCEL_ENV: "preview",
        VERCEL_URL: "health-demo-abc123.vercel.app",
        VERCEL_BRANCH_URL: "health-demo-git-feature.vercel.app",
      }),
    ).toBe("https://health-demo-git-feature.vercel.app");
  });

  it("falls back to the deployment domain and local development defaults", () => {
    expect(resolveAppBaseUrl({ VERCEL_URL: "health-demo-abc123.vercel.app" })).toBe(
      "https://health-demo-abc123.vercel.app",
    );
    expect(resolveAppBaseUrl({})).toBe("http://localhost:3000");
  });

  it("reports the exact Vercel Git SHA before package metadata", () => {
    expect(
      resolveAppVersion({ VERCEL_GIT_COMMIT_SHA: "abc123", npm_package_version: "0.1.0" }),
    ).toBe("abc123");
    expect(resolveAppVersion({ npm_package_version: "0.1.0" })).toBe("0.1.0");
    expect(resolveAppVersion({})).toBe("unknown");
  });
});
