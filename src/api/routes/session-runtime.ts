import { getPrismaClient } from "../../database/prisma.js";
import { SessionService } from "../../services/session-service.js";
import { AssessmentStepService } from "../../services/assessment-step-service.js";
import { AssessmentCompletionService } from "../../services/assessment-completion-service.js";
import { AssessmentResultService } from "../../services/assessment-result-service.js";

export const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

function sessionRuntimeOptions() {
  const tokenSecret = process.env.SESSION_TOKEN_SECRET;
  if (!tokenSecret) throw new Error("SESSION_TOKEN_SECRET is required");
  return {
    tokenSecret,
    secureCookie:
      process.env.SESSION_COOKIE_SECURE === undefined
        ? process.env.NODE_ENV === "production"
        : process.env.SESSION_COOKIE_SECURE === "true",
  };
}

export function getSessionService(): SessionService {
  return new SessionService(getPrismaClient(), sessionRuntimeOptions());
}

export function getAssessmentStepService(): AssessmentStepService {
  return new AssessmentStepService(getPrismaClient(), sessionRuntimeOptions());
}

export function getAssessmentCompletionService(): AssessmentCompletionService {
  return new AssessmentCompletionService(getPrismaClient(), sessionRuntimeOptions());
}

export function getAssessmentResultService(): AssessmentResultService {
  return new AssessmentResultService(getPrismaClient(), sessionRuntimeOptions());
}
