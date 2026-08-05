export const STEP_SLUG_BY_NAME = {
  AGE_RANGE: "age-range",
  SEX: "sex",
  GOAL: "goal",
  AGE: "age",
  HEIGHT: "height",
  CURRENT_WEIGHT: "current-weight",
  TARGET_WEIGHT: "target-weight",
  ACTIVITY_LEVEL: "activity",
} as const;

export const STEP_NAMES = Object.keys(STEP_SLUG_BY_NAME) as StepName[];
export type StepName = keyof typeof STEP_SLUG_BY_NAME;
export type StepSlug = (typeof STEP_SLUG_BY_NAME)[StepName];

export interface AssessmentView {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED";
  currentStep: StepName | "COMPLETE";
  nextStep: StepName | "COMPLETE";
  completedSteps: StepName[];
  answers: Record<string, string | number>;
  version: number;
  actions: ("VIEW_RESULT" | "START_NEW")[];
}

export interface SessionView {
  sessionId: string;
  subscriptionStatus: "INACTIVE" | "ACTIVE" | "EXPIRED";
  assessment: AssessmentView;
}

export interface ApiFailure {
  code: string;
  message: string;
  details: { field: string; reason: string }[];
  requestId: string;
  status: number;
  retryAfterSeconds: number | null;
}

export class ClientApiError extends Error implements ApiFailure {
  constructor(
    readonly code: string,
    message: string,
    readonly details: { field: string; reason: string }[],
    readonly requestId: string,
    readonly status: number,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "same-origin", ...init });
  } catch {
    throw new ClientApiError("NETWORK_ERROR", "We could not reach the server.", [], "client", 0);
  }
  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: Omit<ApiFailure, "status"> }
    | null;
  if (!response.ok || payload?.data === undefined) {
    const error = payload?.error;
    throw new ClientApiError(
      error?.code ?? "UNEXPECTED_RESPONSE",
      error?.message ?? "The server returned an unexpected response.",
      error?.details ?? [],
      error?.requestId ?? response.headers.get("x-request-id") ?? "unknown",
      response.status,
      response.headers.get("retry-after") === null ? null : Number(response.headers.get("retry-after")),
    );
  }
  return payload.data;
}

export function stepPath(step: StepName | "COMPLETE"): string {
  return step === "COMPLETE" ? "/generating" : `/quiz/${STEP_SLUG_BY_NAME[step]}`;
}

export function guardPath(session: SessionView, requested?: StepSlug | "result"): string | null {
  const { assessment } = session;
  if (assessment.status === "COMPLETED") return requested === "result" ? null : "/result";
  if (requested === "result") return stepPath(assessment.nextStep);
  if (!requested) return stepPath(assessment.nextStep);
  const requestedIndex = Object.values(STEP_SLUG_BY_NAME).indexOf(requested);
  const nextIndex = assessment.nextStep === "COMPLETE" ? STEP_NAMES.length : STEP_NAMES.indexOf(assessment.nextStep);
  return requestedIndex > nextIndex ? stepPath(assessment.nextStep) : null;
}

export function rememberSession(): void {
  window.localStorage.setItem("hasSeenSession", "true");
}

export function hasSeenSession(): boolean {
  return window.localStorage.getItem("hasSeenSession") === "true";
}
