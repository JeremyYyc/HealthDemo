import type { PrismaClient } from "../generated/prisma/client.js";
import { z } from "zod";
import { requireSession } from "../api/auth.js";
import { ApiError } from "../api/errors.js";
import {
  serializeFreeResult,
  serializeFullResult,
  type AssessmentResultDto,
} from "../domain/assessment-result.js";

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export class AssessmentResultService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: { tokenSecret: string; secureCookie: boolean; now?: () => Date },
  ) {}

  private async sessionId(request: Request): Promise<string> {
    const session = await requireSession(request, {
      sessions: {
        findByTokenHash: (tokenHash) =>
          this.prisma.session.findUnique({ where: { tokenHash }, select: { id: true, expiresAt: true } }),
      },
      tokenSecret: this.options.tokenSecret,
      secureCookie: this.options.secureCookie,
      now: this.options.now?.() ?? new Date(),
    });
    return session.id;
  }

  async get(request: Request, assessmentId: string): Promise<AssessmentResultDto> {
    const sessionId = await this.sessionId(request);
    if (!z.string().uuid().safeParse(assessmentId).success) throw new ApiError("RESOURCE_NOT_FOUND");
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, sessionId },
      select: {
        id: true,
        status: true,
        session: { select: { subscription: { select: { status: true } } } },
        result: {
          select: {
            bmi: true,
            bmiCategory: true,
            bmrKcal: true,
            tdeeKcal: true,
            recommendedCaloriesKcal: true,
            targetDate: true,
            calculationDate: true,
            estimatedWeeks: true,
            predictionCurve: true,
            calorieFloorApplied: true,
            algorithmVersion: true,
          },
        },
      },
    });
    if (!assessment) throw new ApiError("RESOURCE_NOT_FOUND");
    if (assessment.status !== "COMPLETED") throw new ApiError("ASSESSMENT_NOT_COMPLETED");
    if (!assessment.result) throw new Error("Completed assessment is missing its Result snapshot");

    const common = {
      assessmentId: assessment.id,
      bmi: assessment.result.bmi.toNumber(),
      bmiCategory: assessment.result.bmiCategory,
      algorithmVersion: assessment.result.algorithmVersion,
    };
    if (assessment.session.subscription?.status !== "ACTIVE") return serializeFreeResult(common);
    return serializeFullResult({
      ...common,
      bmrKcal: assessment.result.bmrKcal,
      tdeeKcal: assessment.result.tdeeKcal,
      recommendedCaloriesKcal: assessment.result.recommendedCaloriesKcal,
      estimatedWeeks: assessment.result.estimatedWeeks,
      targetDate: assessment.result.targetDate ? dateOnly(assessment.result.targetDate) : null,
      calculationDate: dateOnly(assessment.result.calculationDate),
      predictionCurve: assessment.result.predictionCurve,
      calorieFloorApplied: assessment.result.calorieFloorApplied,
    });
  }
}
