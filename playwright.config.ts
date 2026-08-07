import { defineConfig } from "@playwright/test";

const noProxy = new Set([
  ...(process.env.NO_PROXY ?? process.env.no_proxy ?? "").split(",").filter(Boolean),
  "127.0.0.1",
  "localhost",
]);
process.env.NO_PROXY = [...noProxy].join(",");
process.env.no_proxy = process.env.NO_PROXY;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chrome",
      use: { browserName: "chromium", ...(process.env.CI ? {} : { channel: "chrome" }) },
    },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER
    ? undefined
    : {
        command: "npm run start -- --hostname 127.0.0.1 --port 3100",
        url: "http://127.0.0.1:3100/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
