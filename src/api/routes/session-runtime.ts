import { getPrismaClient } from "../../database/prisma.js";
import { SessionService } from "../../services/session-service.js";
import { AssessmentStepService } from "../../services/assessment-step-service.js";

export const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

export function getSessionService(): SessionService {
  const tokenSecret = process.env.SESSION_TOKEN_SECRET;
  if (!tokenSecret) throw new Error("SESSION_TOKEN_SECRET is required");
  return new SessionService(getPrismaClient(), {
    tokenSecret,
    secureCookie: process.env.NODE_ENV === "production",
  });
}

export function getAssessmentStepService(): AssessmentStepService {
  const tokenSecret = process.env.SESSION_TOKEN_SECRET;
  if (!tokenSecret) throw new Error("SESSION_TOKEN_SECRET is required");
  return new AssessmentStepService(getPrismaClient(), {
    tokenSecret,
    secureCookie: process.env.NODE_ENV === "production",
  });
}
