import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.js";
import { requireSession } from "../api/auth.js";
import { ApiError } from "../api/errors.js";
import { enforceRateLimit, PAY_RATE_LIMIT, PrismaRateLimitStore } from "../api/rate-limit.js";
import type { DemoPaymentSubmission } from "../domain/demo-payment.js";

export interface DemoPaymentResult {
  paymentId: string;
  paymentCreated: boolean;
  subscriptionStatus: "ACTIVE";
  activatedAt: string;
}

export interface PaymentAuditEntry {
  paymentId: string;
  requestId: string;
  status: "ACTIVE";
}

interface DemoPaymentOptions {
  tokenSecret: string;
  secureCookie: boolean;
  now?: () => Date;
  createTransactionId?: () => string;
  afterPaymentCreated?: () => void | Promise<void>;
  audit?: (entry: PaymentAuditEntry) => void;
}

function response(paymentId: string, activatedAt: Date | null, paymentCreated: boolean): DemoPaymentResult {
  if (!activatedAt) throw new Error("Active Subscription is missing activatedAt");
  return { paymentId, paymentCreated, subscriptionStatus: "ACTIVE", activatedAt: activatedAt.toISOString() };
}

export class DemoPaymentService {
  constructor(private readonly prisma: PrismaClient, private readonly options: DemoPaymentOptions) {}

  private async sessionId(request: Request): Promise<string> {
    const session = await requireSession(request, {
      sessions: { findByTokenHash: (tokenHash) => this.prisma.session.findUnique({ where: { tokenHash }, select: { id: true, expiresAt: true } }) },
      tokenSecret: this.options.tokenSecret,
      secureCookie: this.options.secureCookie,
      now: this.options.now?.() ?? new Date(),
    });
    return session.id;
  }

  async pay(request: Request, submission: DemoPaymentSubmission, requestId: string): Promise<DemoPaymentResult> {
    const sessionId = await this.sessionId(request);
    const now = this.options.now?.() ?? new Date();
    await enforceRateLimit({
      store: new PrismaRateLimitStore(this.prisma),
      policy: PAY_RATE_LIMIT,
      key: sessionId,
      digestSecret: this.options.tokenSecret,
      now,
    });

    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT 1 AS locked
        FROM pg_advisory_xact_lock(hashtextextended(${`pay:${sessionId}`}, 0))
      `;
      const subscription = await transaction.subscription.findUnique({ where: { sessionId } });
      if (!subscription) throw new Error("Session is missing its Subscription");

      const replay = await transaction.payment.findUnique({
        where: { sessionId_idempotencyKey: { sessionId, idempotencyKey: submission.idempotencyKey } },
      });
      if (replay) {
        if (replay.requestFingerprint !== submission.assessmentId) throw new ApiError("IDEMPOTENCY_KEY_REUSED");
        return response(replay.id, subscription.activatedAt, true);
      }

      const assessment = await transaction.assessment.findFirst({
        where: { id: submission.assessmentId, sessionId },
        select: { status: true },
      });
      if (!assessment) throw new ApiError("RESOURCE_NOT_FOUND");
      if (assessment.status !== "COMPLETED") throw new ApiError("ASSESSMENT_NOT_COMPLETED");

      if (subscription.status === "ACTIVE") {
        if (!subscription.activationPaymentId) throw new Error("Active Subscription is missing activationPaymentId");
        return response(subscription.activationPaymentId, subscription.activatedAt, false);
      }

      const payment = await transaction.payment.create({
        data: {
          sessionId,
          assessmentId: submission.assessmentId,
          status: "SUCCEEDED",
          provider: "DEMO",
          idempotencyKey: submission.idempotencyKey,
          requestFingerprint: submission.assessmentId,
          transactionId: this.options.createTransactionId?.() ?? `demo_${randomUUID()}`,
          paidAt: now,
          createdAt: now,
        },
      });
      await this.options.afterPaymentCreated?.();
      const activated = await transaction.subscription.update({
        where: { sessionId },
        data: { status: "ACTIVE", activatedAt: now, expiresAt: null, activationPaymentId: payment.id },
      });
      return response(payment.id, activated.activatedAt, true);
    });
    this.options.audit?.({ paymentId: result.paymentId, requestId, status: "ACTIVE" });
    return result;
  }
}
