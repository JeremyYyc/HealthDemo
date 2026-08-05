import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { ApiError } from "../api/errors.js";
import { requireSession } from "../api/auth.js";
import type { StepSubmission } from "../domain/assessment-steps.js";
import {
  ageMatchesRange,
  toAssessmentDto,
  toDatabaseAgeRange,
  validTargetValues,
} from "./session-service.js";

type AssessmentRecord = Prisma.AssessmentGetPayload<Record<string, never>>;

export interface SaveStepResult {
  assessmentId: string;
  savedStep: StepSubmission["savedStep"];
  completedSteps: ReturnType<typeof toAssessmentDto>["completedSteps"];
  nextStep: ReturnType<typeof toAssessmentDto>["nextStep"];
  invalidatedSteps: ("AGE" | "TARGET_WEIGHT")[];
  version: number;
  replayed: boolean;
}

function currentValue(assessment: AssessmentRecord, submission: StepSubmission): string | number | null {
  switch (submission.field) {
    case "ageRange":
      return assessment.ageRange;
    case "heightCm":
      return assessment.heightCm?.toNumber() ?? null;
    case "weightKg":
      return assessment.weightKg?.toNumber() ?? null;
    case "targetWeightKg":
      return assessment.targetWeightKg?.toNumber() ?? null;
    default:
      return assessment[submission.field];
  }
}

function databaseValue(submission: StepSubmission): string | number {
  return submission.field === "ageRange"
    ? toDatabaseAgeRange(submission.value as "18_29" | "30_39" | "40_49" | "50_100")
    : submission.value;
}

function targetInputs(assessment: AssessmentRecord, submission: StepSubmission) {
  return {
    goal: (submission.field === "goal" ? submission.value : assessment.goal) as
      | "LOSE_WEIGHT"
      | "MAINTAIN_WEIGHT"
      | "GAIN_WEIGHT"
      | null,
    heightCm:
      submission.field === "heightCm" ? (submission.value as number) : (assessment.heightCm?.toNumber() ?? null),
    weightKg:
      submission.field === "weightKg" ? (submission.value as number) : (assessment.weightKg?.toNumber() ?? null),
    targetWeightKg:
      submission.field === "targetWeightKg"
        ? (submission.value as number)
        : (assessment.targetWeightKg?.toNumber() ?? null),
  };
}

function validateBusinessRules(assessment: AssessmentRecord, submission: StepSubmission) {
  if (submission.field === "age") {
    if (assessment.ageRange === null) {
      throw new ApiError("STEP_PREREQUISITE_MISSING", {
        details: [{ field: "ageRange", reason: "Complete AGE_RANGE before AGE." }],
      });
    }
    if (!ageMatchesRange(submission.value as number, assessment.ageRange)) {
      throw new ApiError("BUSINESS_RULE_VIOLATION", {
        details: [{ field: "age", reason: "Age must fall within ageRange." }],
      });
    }
  }

  const projectedTarget = targetInputs(assessment, submission);
  if (submission.field === "targetWeightKg") {
    const missing = [
      ["goal", projectedTarget.goal],
      ["heightCm", projectedTarget.heightCm],
      ["weightKg", projectedTarget.weightKg],
    ].filter(([, value]) => value === null);
    if (missing.length > 0) {
      throw new ApiError("STEP_PREREQUISITE_MISSING", {
        details: missing.map(([field]) => ({ field: String(field), reason: "Complete this prerequisite first." })),
      });
    }
    if (!validTargetValues(projectedTarget)) {
      throw new ApiError("BUSINESS_RULE_VIOLATION", {
        details: [{ field: "targetWeightKg", reason: "Target direction, BMI, or timeline is invalid." }],
      });
    }
  }
}

function buildPlan(assessment: AssessmentRecord, submission: StepSubmission) {
  const projectedTarget = targetInputs(assessment, submission);
  const data: Record<string, string | number | null | { increment: number }> = {
    [submission.field]: databaseValue(submission),
    version: { increment: 1 },
  };
  const invalidatedSteps: ("AGE" | "TARGET_WEIGHT")[] = [];
  if (
    submission.field === "ageRange" &&
    assessment.age !== null &&
    !ageMatchesRange(assessment.age, databaseValue(submission) as AssessmentRecord["ageRange"])
  ) {
    data.age = null;
    invalidatedSteps.push("AGE");
  }
  if (
    (submission.field === "goal" || submission.field === "heightCm" || submission.field === "weightKg") &&
    assessment.targetWeightKg !== null &&
    !validTargetValues(projectedTarget)
  ) {
    data.targetWeightKg = null;
    invalidatedSteps.push("TARGET_WEIGHT");
  }
  return {
    data,
    invalidatedSteps,
    sameValue: currentValue(assessment, submission) === databaseValue(submission),
  };
}

export class AssessmentStepService {
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

  async save(request: Request, assessmentId: string, submission: StepSubmission): Promise<SaveStepResult> {
    const sessionId = await this.sessionId(request);
    return this.prisma.$transaction(async (transaction) => {
      const assessment = await transaction.assessment.findFirst({ where: { id: assessmentId, sessionId } });
      if (!assessment) throw new ApiError("RESOURCE_NOT_FOUND");
      if (assessment.status === "COMPLETED") throw new ApiError("ASSESSMENT_LOCKED");
      const plan = buildPlan(assessment, submission);
      if (plan.sameValue && plan.invalidatedSteps.length === 0) {
        const dto = toAssessmentDto(assessment);
        return {
          assessmentId,
          savedStep: submission.savedStep,
          completedSteps: dto.completedSteps,
          nextStep: dto.nextStep,
          invalidatedSteps: [],
          version: assessment.version,
          replayed: true,
        };
      }
      if (assessment.version !== submission.version) throw new ApiError("VERSION_CONFLICT");
      validateBusinessRules(assessment, submission);

      const updated = await transaction.assessment.updateMany({
        where: { id: assessmentId, sessionId, status: "IN_PROGRESS", version: submission.version },
        data: plan.data,
      });
      if (updated.count === 0) {
        const fresh = await transaction.assessment.findFirst({ where: { id: assessmentId, sessionId } });
        if (!fresh) throw new ApiError("RESOURCE_NOT_FOUND");
        if (fresh.status === "COMPLETED") throw new ApiError("ASSESSMENT_LOCKED");
        let freshPlan;
        try {
          freshPlan = buildPlan(fresh, submission);
        } catch {
          throw new ApiError("VERSION_CONFLICT");
        }
        if (freshPlan.sameValue && freshPlan.invalidatedSteps.length === 0) {
          const dto = toAssessmentDto(fresh);
          return {
            assessmentId,
            savedStep: submission.savedStep,
            completedSteps: dto.completedSteps,
            nextStep: dto.nextStep,
            invalidatedSteps: [],
            version: fresh.version,
            replayed: true,
          };
        }
        throw new ApiError("VERSION_CONFLICT");
      }
      const saved = await transaction.assessment.findUniqueOrThrow({ where: { id: assessmentId } });
      const dto = toAssessmentDto(saved);
      return {
        assessmentId,
        savedStep: submission.savedStep,
        completedSteps: dto.completedSteps,
        nextStep: dto.nextStep,
        invalidatedSteps: plan.invalidatedSteps,
        version: saved.version,
        replayed: false,
      };
    });
  }
}
