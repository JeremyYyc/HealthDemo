import { expect, test, type Page, type Route } from "@playwright/test";

const STEPS = ["AGE_RANGE", "SEX", "GOAL", "AGE", "HEIGHT", "CURRENT_WEIGHT", "TARGET_WEIGHT", "ACTIVITY_LEVEL"] as const;
const SLUGS = ["age-range", "sex", "goal", "age", "height", "current-weight", "target-weight", "activity"] as const;
const FIELDS = ["ageRange", "sex", "goal", "age", "heightCm", "weightKg", "targetWeightKg", "activityLevel"] as const;

type Step = (typeof STEPS)[number];
type MockState = {
  sessionId: string;
  subscriptionStatus: "INACTIVE";
  assessment: {
    id: string;
    status: "IN_PROGRESS" | "COMPLETED";
    currentStep: Step | "COMPLETE";
    nextStep: Step | "COMPLETE";
    completedSteps: Step[];
    answers: Record<string, string | number>;
    version: number;
    actions: string[];
  };
};

function stateAt(nextStep: Step | "COMPLETE" = "SEX", answers: Record<string, string | number> = { ageRange: "18_29" }): MockState {
  const nextIndex = nextStep === "COMPLETE" ? STEPS.length : STEPS.indexOf(nextStep);
  return {
    sessionId: "session-browser",
    subscriptionStatus: "INACTIVE",
    assessment: {
      id: "assessment-browser",
      status: "IN_PROGRESS",
      currentStep: nextStep,
      nextStep,
      completedSteps: STEPS.slice(0, nextIndex),
      answers,
      version: Math.max(0, nextIndex - 1),
      actions: [],
    },
  };
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockFunnel(
  page: Page,
  initial: MockState | null,
  options: { failValidTargetOnce?: boolean; conflictStepOnce?: string; conflictValue?: string | number; failSessionOnce?: boolean; failNewAssessmentOnce?: boolean } = {},
) {
  let state = initial;
  let validTargetFailed = false;
  let conflictSent = false;
  let sessionFailed = false;
  let newAssessmentFailed = false;
  let newAssessmentRequests = 0;
  const submittedBodies: Record<string, unknown>[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/session") {
      if (options.failSessionOnce && !sessionFailed) {
        sessionFailed = true;
        return json(route, 503, { error: { code: "SERVICE_UNAVAILABLE", message: "The service is unavailable.", details: [], requestId: "req_e2e" } });
      }
      return state
        ? json(route, 200, { data: state, meta: { requestId: "req_e2e" } })
        : json(route, 401, { error: { code: "SESSION_REQUIRED", message: "A valid session is required.", details: [], requestId: "req_e2e" } });
    }
    if (path === "/api/sessions" && request.method() === "POST") {
      const ageRange = (request.postDataJSON() as { ageRange: string }).ageRange;
      state = stateAt("SEX", { ageRange });
      return json(route, 201, { data: state, meta: { requestId: "req_e2e" } });
    }
    if (path === "/api/assessments" && request.method() === "POST" && state) {
      newAssessmentRequests += 1;
      if (options.failNewAssessmentOnce && !newAssessmentFailed) {
        newAssessmentFailed = true;
        return json(route, 503, { error: { code: "SERVICE_UNAVAILABLE", message: "The service is unavailable.", details: [], requestId: "req_e2e" } });
      }
      state = stateAt("AGE_RANGE", {});
      return json(route, 201, { data: { ...state.assessment, created: true }, meta: { requestId: "req_e2e" } });
    }
    const stepMatch = path.match(/^\/api\/assessments\/[^/]+\/steps\/(.+)$/);
    if (stepMatch && request.method() === "PATCH" && state) {
      const slug = stepMatch[1]!;
      const index = SLUGS.indexOf(slug as (typeof SLUGS)[number]);
      const body = request.postDataJSON() as Record<string, string | number>;
      submittedBodies.push(body);
      if (slug === options.conflictStepOnce && !conflictSent) {
        conflictSent = true;
        state.assessment.answers[FIELDS[index]!] = options.conflictValue ?? (slug === "sex" ? "MALE" : body[FIELDS[index]!]!);
        state.assessment.version += 1;
        return json(route, 409, { error: { code: "VERSION_CONFLICT", message: "The resource version has changed.", details: [], requestId: "req_e2e" } });
      }
      if (slug === "target-weight" && Number(body.targetWeightKg) >= Number(state.assessment.answers.weightKg)) {
        return json(route, 422, { error: { code: "BUSINESS_RULE_VIOLATION", message: "The request violates a business rule.", details: [{ field: "targetWeightKg", reason: "For a weight-loss goal, target weight must be below current weight." }], requestId: "req_e2e" } });
      }
      if (slug === "target-weight" && options.failValidTargetOnce && !validTargetFailed) {
        validTargetFailed = true;
        return json(route, 500, { error: { code: "INTERNAL_ERROR", message: "An internal error occurred.", details: [], requestId: "req_e2e" } });
      }
      state.assessment.answers[FIELDS[index]!] = body[FIELDS[index]!]!;
      state.assessment.version += 1;
      state.assessment.completedSteps = STEPS.slice(0, index + 1);
      state.assessment.nextStep = STEPS[index + 1] ?? "COMPLETE";
      state.assessment.currentStep = state.assessment.nextStep;
      return json(route, 200, { data: { assessmentId: state.assessment.id, savedStep: STEPS[index], completedSteps: state.assessment.completedSteps, nextStep: state.assessment.nextStep, invalidatedSteps: [], version: state.assessment.version, replayed: false }, meta: { requestId: "req_e2e" } });
    }
    if (path.endsWith("/complete") && request.method() === "POST" && state) {
      state.assessment.status = "COMPLETED";
      state.assessment.actions = ["VIEW_RESULT", "START_NEW"];
      return json(route, 200, { data: { assessmentId: state.assessment.id, status: "COMPLETED" }, meta: { requestId: "req_e2e" } });
    }
    return route.fallback();
  });
  return { getState: () => state, submittedBodies, getNewAssessmentRequests: () => newAssessmentRequests };
}

test("P0-04-T01 new visitor completes eight steps and reaches the free result", async ({ page }) => {
  await mockFunnel(page, null);
  await page.goto("/");
  await page.getByRole("button", { name: "18–29" }).click();
  await expect(page).toHaveURL(/\/quiz\/sex$/);
  await page.getByLabel("Female").check(); await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Lose weight").check(); await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Age in years").fill("25"); await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/height/i).fill("170"); await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/current weight/i).fill("80"); await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/target weight/i).fill("75"); await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Exercise 3–5 days/week").check(); await page.getByRole("button", { name: "Generate my summary" }).click();
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByRole("heading", { name: "Your free health summary is ready." })).toBeVisible();
  await expect(page.getByText("It is not medical advice")).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["hasSeenSession"]);
});

test("P0-04-T02 refresh restores the answer and server-selected step", async ({ page }) => {
  await mockFunnel(page, stateAt("CURRENT_WEIGHT", { ageRange: "18_29", sex: "FEMALE", goal: "LOSE_WEIGHT", age: 25, heightCm: 170, weightKg: 80 }));
  await page.goto("/quiz/current-weight");
  await expect(page.getByLabel(/current weight/i)).toHaveValue("80");
  await page.reload();
  await expect(page).toHaveURL(/\/quiz\/current-weight$/);
  await expect(page.getByLabel(/current weight/i)).toHaveValue("80");
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "6");
});

test("P0-04-T03 server error preserves target input and original request can be retried", async ({ page }) => {
  const state = stateAt("TARGET_WEIGHT", { ageRange: "18_29", sex: "FEMALE", goal: "LOSE_WEIGHT", age: 25, heightCm: 170, weightKg: 80 });
  await mockFunnel(page, state, { failValidTargetOnce: true });
  await page.goto("/quiz/target-weight");
  const input = page.getByLabel(/target weight/i);
  await input.fill("85");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#field-error")).toContainText("target weight must be below current weight");
  await expect(input).toHaveValue("85");
  await input.fill("75");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#field-error")).toContainText(/internal error/i);
  await expect(input).toHaveValue("75");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page).toHaveURL(/\/quiz\/activity$/);
});

test("P0-04 measurement conflict syncs the visible and normalized values before confirmation", async ({ page }) => {
  const mocked = await mockFunnel(page, stateAt("HEIGHT", { ageRange: "18_29", sex: "FEMALE", goal: "LOSE_WEIGHT", age: 25, heightCm: 170 }), { conflictStepOnce: "height", conflictValue: 175 });
  await page.goto("/quiz/height");
  await page.getByLabel(/height/i).fill("180");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("status")).toContainText("changed in another tab");
  await expect(page.getByLabel(/height/i)).toHaveValue("175");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/quiz\/current-weight$/);
  expect(mocked.submittedBodies.at(-1)).toMatchObject({ heightCm: 175 });
});

test("P0-04 restore failures show retry instead of a false new-visitor or endless loading state", async ({ page }) => {
  await mockFunnel(page, stateAt("SEX"), { failSessionOnce: true });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "We couldn’t restore your assessment" })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page).toHaveURL(/\/quiz\/sex$/);
});

test("P0-04 starting a new assessment is single-flight and recoverable", async ({ page }) => {
  const completed = stateAt("COMPLETE");
  completed.assessment.status = "COMPLETED";
  const mocked = await mockFunnel(page, completed, { failNewAssessmentOnce: true });
  await page.goto("/result");
  await page.getByRole("button", { name: "Start a new assessment" }).evaluate((button: HTMLButtonElement) => {
    button.click(); button.click();
  });
  await expect(page.locator(".result-hero .error-banner")).toContainText(/service is unavailable/i);
  expect(mocked.getNewAssessmentRequests()).toBe(1);
  await page.getByRole("button", { name: "Retry new assessment" }).click();
  await expect(page).toHaveURL(/\/quiz\/age-range$/);
  expect(mocked.getNewAssessmentRequests()).toBe(2);
});

test("P0-04 unauthenticated generating and result routes enter the first-or-lost session flow", async ({ page }) => {
  await mockFunnel(page, null);
  await page.goto("/result");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "What is your age range?" })).toBeVisible();
  await page.evaluate(() => localStorage.setItem("hasSeenSession", "true"));
  await page.goto("/generating");
  await expect(page).toHaveURL(/\/\?lost=1$/);
  await expect(page.getByRole("heading", { name: "Your previous progress can’t be restored" })).toBeVisible();
});

test("P0-04-T04 only a returning browser sees the lost-session explanation", async ({ page }) => {
  await mockFunnel(page, null);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What is your age range?" })).toBeVisible();
  await page.evaluate(() => localStorage.setItem("hasSeenSession", "true"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your previous progress can’t be restored" })).toBeVisible();
  await page.getByRole("button", { name: "Start a new assessment" }).click();
  await expect(page.getByRole("heading", { name: "What is your age range?" })).toBeVisible();
});

test("P0-04-T05 direct routes obey server nextStep and completion status", async ({ page }) => {
  const mocked = await mockFunnel(page, stateAt("HEIGHT", { ageRange: "18_29", sex: "FEMALE", goal: "LOSE_WEIGHT", age: 25 }));
  await page.goto("/quiz/activity");
  await expect(page).toHaveURL(/\/quiz\/height$/);
  await page.goto("/quiz/sex");
  await expect(page).toHaveURL(/\/quiz\/sex$/);
  await page.goto("/result");
  await expect(page).toHaveURL(/\/quiz\/height$/);
  mocked.getState()!.assessment.status = "COMPLETED";
  await page.goto("/quiz/height");
  await expect(page).toHaveURL(/\/result$/);
});

test("P0-04-T06 controls are keyboard operable and mobile layout has no overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await mockFunnel(page, stateAt("SEX"));
  await page.goto("/quiz/sex");
  await page.getByLabel("Female").focus();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Female")).toBeChecked();
  await expect(page.getByRole("button", { name: "Continue" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("P0-04-T07 unit round trip retains display value and submits normalized metric", async ({ page }) => {
  const mocked = await mockFunnel(page, stateAt("HEIGHT", { ageRange: "18_29", sex: "FEMALE", goal: "LOSE_WEIGHT", age: 25, heightCm: 170 }));
  await page.goto("/quiz/height");
  const height = page.getByLabel(/height/i);
  await expect(height).toHaveValue("170");
  await page.getByRole("button", { name: "Imperial" }).click();
  await expect(page.getByLabel("Feet")).toHaveValue("5");
  await page.getByRole("button", { name: "Metric" }).click();
  await expect(page.getByLabel(/height/i)).toHaveValue("170");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/quiz\/current-weight$/);
  expect(mocked.submittedBodies.at(-1)).toMatchObject({ heightCm: 170 });
});
