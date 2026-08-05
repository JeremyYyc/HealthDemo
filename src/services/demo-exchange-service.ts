import type { PrismaClient } from "../generated/prisma/client.js";
import { constantTimeDigestEquals, digestOpaqueValue } from "../api/auth.js";
import { ApiError } from "../api/errors.js";
import { DEMO_EXCHANGE_RATE_LIMIT, enforceRateLimit, PrismaRateLimitStore } from "../api/rate-limit.js";
import { DEMO_FIXTURE_IDS } from "../domain/demo-fixtures.js";
import { buildSessionCookie } from "./session-service.js";

interface DemoExchangeOptions {
  tokenSecret: string;
  secureCookie: boolean;
  enabled: boolean;
  reviewCodeHash?: string;
  paidSessionToken?: string;
  now?: () => Date;
}

function sourceAddress(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export class DemoExchangeService {
  constructor(private readonly prisma: PrismaClient, private readonly options: DemoExchangeOptions) {}

  async exchange(request: Request, reviewCode: string) {
    const now = this.options.now?.() ?? new Date();
    const { reviewCodeHash, paidSessionToken } = this.options;
    if (!this.options.enabled || !reviewCodeHash || !/^[a-f0-9]{64}$/.test(reviewCodeHash) || !paidSessionToken) throw new ApiError("DEMO_EXCHANGE_UNAVAILABLE");
    await enforceRateLimit({ store: new PrismaRateLimitStore(this.prisma), policy: DEMO_EXCHANGE_RATE_LIMIT, key: sourceAddress(request), digestSecret: this.options.tokenSecret, now });
    const actualHash = digestOpaqueValue(reviewCode, this.options.tokenSecret);
    if (!constantTimeDigestEquals(actualHash, reviewCodeHash)) throw new ApiError("INVALID_REVIEW_CODE");

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: digestOpaqueValue(paidSessionToken, this.options.tokenSecret) },
      select: {
        id: true,
        expiresAt: true,
        subscription: {
          select: {
            id: true,
            status: true,
            activatedAt: true,
            expiresAt: true,
            activationPaymentId: true,
            activationPayment: {
              select: { id: true, sessionId: true, assessmentId: true, status: true, provider: true, paidAt: true },
            },
          },
        },
        assessments: {
          where: { id: DEMO_FIXTURE_IDS.paid.assessment, status: "COMPLETED" },
          select: { id: true, result: { select: { id: true } } },
        },
      },
    });
    const subscription = session?.subscription;
    const payment = subscription?.activationPayment;
    const assessment = session?.assessments[0];
    if (
      !session
      || session.id !== DEMO_FIXTURE_IDS.paid.session
      || session.expiresAt <= now
      || subscription?.id !== DEMO_FIXTURE_IDS.paid.subscription
      || subscription.status !== "ACTIVE"
      || !subscription.activatedAt
      || subscription.expiresAt !== null
      || subscription.activationPaymentId !== DEMO_FIXTURE_IDS.paid.payment
      || payment?.id !== DEMO_FIXTURE_IDS.paid.payment
      || payment.sessionId !== session.id
      || payment.assessmentId !== DEMO_FIXTURE_IDS.paid.assessment
      || payment.status !== "SUCCEEDED"
      || payment.provider !== "DEMO"
      || !payment.paidAt
      || assessment?.id !== DEMO_FIXTURE_IDS.paid.assessment
      || assessment.result?.id !== DEMO_FIXTURE_IDS.paid.result
    ) {
      throw new ApiError("DEMO_EXCHANGE_UNAVAILABLE");
    }
    return {
      data: { accessLevel: "FULL" as const, resultUrl: `/api/assessments/${assessment.id}/result` },
      cookie: buildSessionCookie(paidSessionToken, session.expiresAt, this.options.secureCookie),
    };
  }
}
