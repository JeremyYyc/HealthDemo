import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { AgeRange } from "../generated/prisma/enums.js";
import { digestOpaqueValue, readCookie, requireSession, SESSION_COOKIE_NAME } from "../api/auth.js";

export const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
export const ASSESSMENT_STEPS = [
  "AGE_RANGE",
  "SEX",
  "GOAL",
  "AGE",
  "HEIGHT",
  "WEIGHT",
  "TARGET_WEIGHT",
  "ACTIVITY_LEVEL",
] as const;

export type ApiAgeRange = "18_29" | "30_39" | "40_49" | "50_100";
export type AssessmentStep = (typeof ASSESSMENT_STEPS)[number];

const AGE_RANGE_TO_DATABASE: Record<ApiAgeRange, AgeRange> = {
  "18_29": AgeRange.AGE_18_29,
  "30_39": AgeRange.AGE_30_39,
  "40_49": AgeRange.AGE_40_49,
  "50_100": AgeRange.AGE_50_100,
};

const DATABASE_TO_AGE_RANGE: Record<AgeRange, ApiAgeRange> = {
  [AgeRange.AGE_18_29]: "18_29",
  [AgeRange.AGE_30_39]: "30_39",
  [AgeRange.AGE_40_49]: "40_49",
  [AgeRange.AGE_50_100]: "50_100",
};

const assessmentSelection = {
  id: true,
  status: true,
  version: true,
  ageRange: true,
  sex: true,
  goal: true,
  age: true,
  heightCm: true,
  weightKg: true,
  targetWeightKg: true,
  activityLevel: true,
  completedAt: true,
} as const;

type SelectedAssessment = Prisma.AssessmentGetPayload<{ select: typeof assessmentSelection }>;

export interface AssessmentDto {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED";
  currentStep: AssessmentStep | "COMPLETE";
  nextStep: AssessmentStep | "COMPLETE";
  completedSteps: AssessmentStep[];
  answers: Record<string, string | number>;
  version: number;
  actions: ("VIEW_RESULT" | "START_NEW")[];
}

export interface SessionDto {
  sessionId: string;
  subscriptionStatus: "INACTIVE" | "ACTIVE" | "EXPIRED";
  assessment: AssessmentDto;
}

function answerEntries(assessment: SelectedAssessment): [AssessmentStep, string, string | number | null][] {
  return [
    ["AGE_RANGE", "ageRange", assessment.ageRange ? DATABASE_TO_AGE_RANGE[assessment.ageRange] : null],
    ["SEX", "sex", assessment.sex],
    ["GOAL", "goal", assessment.goal],
    ["AGE", "age", assessment.age],
    ["HEIGHT", "heightCm", assessment.heightCm?.toNumber() ?? null],
    ["WEIGHT", "weightKg", assessment.weightKg?.toNumber() ?? null],
    ["TARGET_WEIGHT", "targetWeightKg", assessment.targetWeightKg?.toNumber() ?? null],
    ["ACTIVITY_LEVEL", "activityLevel", assessment.activityLevel],
  ];
}

export function toAssessmentDto(assessment: SelectedAssessment): AssessmentDto {
  const entries = answerEntries(assessment);
  const completedSteps = entries.filter(([, , value]) => value !== null).map(([step]) => step);
  const nextStep = entries.find(([, , value]) => value === null)?.[0] ?? "COMPLETE";
  return {
    id: assessment.id,
    status: assessment.status,
    currentStep: nextStep,
    nextStep,
    completedSteps,
    answers: Object.fromEntries(entries.flatMap(([, field, value]) => (value === null ? [] : [[field, value]]))),
    version: assessment.version,
    actions: assessment.status === "COMPLETED" ? ["VIEW_RESULT", "START_NEW"] : [],
  };
}

function sessionCookie(token: string, expiresAt: Date, secure: boolean): string {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    `Max-Age=${SESSION_LIFETIME_SECONDS}`,
    `Expires=${expiresAt.toUTCString()}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export class SessionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: {
      tokenSecret: string;
      secureCookie: boolean;
      now?: () => Date;
      createToken?: () => string;
    },
  ) {}

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private createToken(): string {
    return this.options.createToken?.() ?? randomBytes(32).toString("base64url");
  }

  private async authorize(request: Request) {
    return requireSession(request, {
      sessions: {
        findByTokenHash: (tokenHash) =>
          this.prisma.session.findUnique({ where: { tokenHash }, select: { id: true, expiresAt: true } }),
      },
      tokenSecret: this.options.tokenSecret,
      secureCookie: this.options.secureCookie,
      now: this.now(),
    });
  }

  private async sessionDto(sessionId: string): Promise<SessionDto> {
    const session = await this.prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        id: true,
        subscription: { select: { status: true } },
        assessments: {
          orderBy: [{ status: "asc" }, { completedAt: "desc" }, { id: "desc" }],
          select: assessmentSelection,
        },
      },
    });
    const inProgress = session.assessments.find(({ status }) => status === "IN_PROGRESS");
    const assessment = inProgress ?? session.assessments.find(({ status }) => status === "COMPLETED");
    if (!assessment || !session.subscription) throw new Error("Session invariants are incomplete");
    return {
      sessionId: session.id,
      subscriptionStatus: session.subscription.status,
      assessment: toAssessmentDto(assessment),
    };
  }

  async enter(request: Request, ageRange: ApiAgeRange): Promise<{ data: SessionDto; status: 200 | 201; cookie?: string }> {
    const existingToken = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
    if (existingToken) {
      const session = await this.authorize(request);
      return { data: await this.sessionDto(session.id), status: 200 };
    }

    const token = this.createToken();
    const now = this.now();
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_SECONDS * 1000);
    const created = await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.session.create({
        data: {
          tokenHash: digestOpaqueValue(token, this.options.tokenSecret),
          createdAt: now,
          updatedAt: now,
          expiresAt,
          assessments: { create: { ageRange: AGE_RANGE_TO_DATABASE[ageRange], createdAt: now, updatedAt: now } },
          subscription: { create: { status: "INACTIVE", updatedAt: now } },
        },
        select: { id: true },
      });
      return session.id;
    });
    return {
      data: await this.sessionDto(created),
      status: 201,
      cookie: sessionCookie(token, expiresAt, this.options.secureCookie),
    };
  }

  async restore(request: Request): Promise<SessionDto> {
    const session = await this.authorize(request);
    return this.sessionDto(session.id);
  }

  async createAssessment(request: Request): Promise<{ data: AssessmentDto & { created: boolean }; status: 200 | 201 }> {
    const session = await this.authorize(request);
    const existing = await this.prisma.assessment.findFirst({
      where: { sessionId: session.id, status: "IN_PROGRESS" },
      select: assessmentSelection,
    });
    if (existing) return { data: { ...toAssessmentDto(existing), created: false }, status: 200 };

    try {
      const created = await this.prisma.assessment.create({
        data: { sessionId: session.id, updatedAt: this.now() },
        select: assessmentSelection,
      });
      return { data: { ...toAssessmentDto(created), created: true }, status: 201 };
    } catch (error) {
      if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") throw error;
      const raced = await this.prisma.assessment.findFirstOrThrow({
        where: { sessionId: session.id, status: "IN_PROGRESS" },
        select: assessmentSelection,
      });
      return { data: { ...toAssessmentDto(raced), created: false }, status: 200 };
    }
  }
}
