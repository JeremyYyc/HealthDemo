import { getPrismaClient } from "../../database/prisma.js";
import { SessionService } from "../../services/session-service.js";
import { AssessmentStepService } from "../../services/assessment-step-service.js";
import { AssessmentCompletionService } from "../../services/assessment-completion-service.js";
import { AssessmentResultService } from "../../services/assessment-result-service.js";
import { DemoPaymentService } from "../../services/demo-payment-service.js";
import { DemoExchangeService } from "../../services/demo-exchange-service.js";
import { resolveAppBaseUrl } from "../runtime-config.js";

export const appBaseUrl = resolveAppBaseUrl();

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

export function getDemoPaymentService(): DemoPaymentService {
  return new DemoPaymentService(getPrismaClient(), {
    ...sessionRuntimeOptions(),
    audit: (entry) => console.info("demo_payment", entry),
  });
}

export function getDemoExchangeService(): DemoExchangeService {
  return new DemoExchangeService(getPrismaClient(), {
    ...sessionRuntimeOptions(),
    enabled: process.env.DEMO_EXCHANGE_ENABLED === "true",
    ...(process.env.DEMO_REVIEW_CODE_HASH ? { reviewCodeHash: process.env.DEMO_REVIEW_CODE_HASH } : {}),
    ...(process.env.DEMO_PAID_SESSION_TOKEN ? { paidSessionToken: process.env.DEMO_PAID_SESSION_TOKEN } : {}),
  });
}
