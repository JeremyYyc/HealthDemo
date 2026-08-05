import { expect, test, type Page } from "@playwright/test";

test.skip(!process.env.E2E_REAL_BACKEND, "Set E2E_REAL_BACKEND=1 with the test database to run real API browser tests.");

async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "18–29" }).click();
  await expect(page).toHaveURL(/\/quiz\/sex$/);
}

async function choose(page: Page, label: string, button = "Continue") {
  await page.getByLabel(label, { exact: true }).check();
  await page.getByRole("button", { name: button }).click();
}

async function reachTargetWeight(page: Page) {
  await start(page);
  await choose(page, "Female");
  await choose(page, "Lose weight");
  await page.getByLabel("Age in years").fill("25"); await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/height/i).fill("170"); await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/current weight/i).fill("80"); await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/quiz\/target-weight$/);
}

test("P0-04 real T01/T02 uses the session cookie, saves all steps, and restores from PostgreSQL", async ({ page, context }) => {
  let assessmentId = "";
  page.on("request", (request) => {
    const match = new URL(request.url()).pathname.match(/^\/api\/assessments\/([^/]+)\/steps\//);
    if (match) assessmentId = match[1]!;
  });

  await reachTargetWeight(page);
  const cookies = await context.cookies();
  expect(cookies.find(({ name }) => name === "health_demo_session")).toMatchObject({ httpOnly: true, sameSite: "Lax" });
  await page.reload();
  await expect(page.getByLabel(/target weight/i)).toHaveValue("");
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page.getByLabel(/current weight/i)).toHaveValue("80");
  await page.goto("/quiz/target-weight");
  await page.getByLabel(/target weight/i).fill("75"); await page.getByRole("button", { name: "Continue" }).click();
  await choose(page, "Exercise 3–5 days/week", "Generate my summary");
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByRole("heading", { name: "Your free health summary is ready." })).toBeVisible();
});

test("P0-04 real T03 returns server business errors and retries the same valid input after a transport failure", async ({ page }) => {
  await reachTargetWeight(page);
  const input = page.getByLabel(/target weight/i);
  await input.fill("85"); await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#field-error")).toContainText(/target direction|weight-loss goal/i);
  await expect(input).toHaveValue("85");

  let failed = false;
  await page.route("**/api/assessments/*/steps/target-weight", (route) => {
    if (failed) return route.fallback();
    failed = true;
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SERVICE_UNAVAILABLE", message: "The service is unavailable.", details: [], requestId: "req_transport" } }) });
  });
  await input.fill("75"); await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#field-error")).toContainText(/service is unavailable/i);
  await expect(input).toHaveValue("75");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page).toHaveURL(/\/quiz\/activity$/);
});

test("P0-04 real T04 distinguishes a first visit from a browser with a lost session", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What is your age range?" })).toBeVisible();
  await page.evaluate(() => localStorage.setItem("hasSeenSession", "true"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your previous progress can’t be restored" })).toBeVisible();
});

test("P0-04 real T05 guards late and result routes using the PostgreSQL-backed nextStep", async ({ page }) => {
  await start(page);
  await choose(page, "Female");
  await choose(page, "Lose weight");
  await page.getByLabel("Age in years").fill("25"); await page.getByRole("button", { name: "Continue" }).click();
  await page.evaluate(() => window.location.assign("/quiz/activity"));
  await expect(page).toHaveURL(/\/quiz\/height$/);
  await page.evaluate(() => window.location.assign("/result"));
  await expect(page).toHaveURL(/\/quiz\/height$/);
  await page.evaluate(() => window.location.assign("/quiz/sex"));
  await expect(page).toHaveURL(/\/quiz\/sex$/);
});
