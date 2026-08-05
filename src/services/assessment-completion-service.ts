import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { ApiError } from "../api/errors.js";
import { requireSession } from "../api/auth.js";
import {
  calculateHealthResult,
  type HealthCalculationInput,
  type HealthCalculationResult,
} from "../domain/health-calculation.js";
import { ASSESSMENT_STEPS, toAssessmentDto } from "./session-service.js";

type AssessmentRecord = Prisma.AssessmentGetPayload<Record<string, never>>;

export interface CompleteAssessmentResult {
  assessmentId: string;
  status: "COMPLETED";
  completedAt: string;
  resultUrl: string;
  version: number;
  replayed: boolean;
}

interface CompletionOptions {
  tokenSecret: string;
  secureCookie: boolean;
  now?: () => Date;
  calculate?: (input: HealthCalculationInput) => HealthCalculationResult;
  beforeResultCreated?: () => void | Promise<void>;
  afterResultCreated?: () => void | Promise<void>;
}

function utcDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function completionMetadata(assessment: AssessmentRecord, replayed: boolean): CompleteAssessmentResult {
  if (!assessment.completedAt) throw new Error("Completed assessment is missing completedAt");
  return {
    assessmentId: assessment.id,
    status: "COMPLETED",
    completedAt: assessment.completedAt.toISOString(),
    resultUrl: `/api/assessments/${assessment.id}/result`,
    version: assessment.version,
    replayed,
  };
}

function calculationInput(assessment: AssessmentRecord, calculationDate: string): HealthCalculationInput {
  const dto = toAssessmentDto(assessment);
  const requiredSteps = ASSESSMENT_STEPS.filter((step) => !dto.completedSteps.includes(step));
  if (requiredSteps.length > 0) {
    throw new ApiError("ASSESSMENT_INCOMPLETE", {
      details: requiredSteps.map((step) => ({ field: "requiredSteps", reason: step })),
    });
  }
  const answers = dto.answers;
  return {
    ageRange: answers.ageRange as HealthCalculationInput["ageRange"],
    sex: answers.sex as HealthCalculationInput["sex"],
    goal: answers.goal as HealthCalculationInput["goal"],
    age: answers.age as number,
    heightCm: answers.heightCm as number,
    weightKg: answers.weightKg as number,
    targetWeightKg: answers.targetWeightKg as number,
    activityLevel: answers.activityLevel as HealthCalculationInput["activityLevel"],
    calculationDate,
  };
}

function isCompletionRace(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

export class AssessmentCompletionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: CompletionOptions,
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

  async complete(request: Request, assessmentId: string, version: number): Promise<CompleteAssessmentResult> {
    const sessionId = await this.sessionId(request);
    const transactionStartedAt = this.options.now?.() ?? new Date();
    const calculationDate = utcDateOnly(transactionStartedAt);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          SELECT 1 AS locked
          FROM pg_advisory_xact_lock(hashtextextended(${assessmentId}, 0))
        `;
        const assessment = await transaction.assessment.findFirst({ where: { id: assessmentId, sessionId } });
        if (!assessment) throw new ApiError("RESOURCE_NOT_FOUND");
        if (assessment.status === "COMPLETED") return completionMetadata(assessment, true);
        if (assessment.version !== version) throw new ApiError("VERSION_CONFLICT");

        const calculated = (this.options.calculate ?? calculateHealthResult)(
          calculationInput(assessment, calculationDate),
        );
        await this.options.beforeResultCreated?.();
        await transaction.assessmentResult.create({
          data: {
            assessmentId,
            bmi: calculated.bmi,
            bmiCategory: calculated.bmiCategory,
            bmrKcal: calculated.bmrKcal,
            tdeeKcal: calculated.tdeeKcal,
            recommendedCaloriesKcal: calculated.recommendedCaloriesKcal,
            targetDate: calculated.targetDate ? new Date(`${calculated.targetDate}T00:00:00.000Z`) : null,
            calculationDate: new Date(`${calculated.calculationDate}T00:00:00.000Z`),
            estimatedWeeks: calculated.estimatedWeeks,
            predictionCurve: calculated.predictionCurve.map((point) => ({ ...point })),
            calorieFloorApplied: calculated.calorieFloorApplied,
            algorithmVersion: calculated.algorithmVersion,
          },
        });
        await this.options.afterResultCreated?.();

        const completed = await transaction.assessment.updateMany({
          where: { id: assessmentId, sessionId, status: "IN_PROGRESS", version },
          data: { status: "COMPLETED", version: { increment: 1 }, completedAt: transactionStartedAt },
        });
        if (completed.count !== 1) throw new Error("Assessment completion condition changed while locked");
        const saved = await transaction.assessment.findUniqueOrThrow({ where: { id: assessmentId } });
        return completionMetadata(saved, false);
      });
    } catch (error) {
      if (isCompletionRace(error)) {
        const completed = await this.prisma.assessment.findFirst({ where: { id: assessmentId, sessionId } });
        if (completed?.status === "COMPLETED") return completionMetadata(completed, true);
      }
      throw error;
    }
  }
}
