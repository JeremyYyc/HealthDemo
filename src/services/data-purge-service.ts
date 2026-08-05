import type { PrismaClient } from "../generated/prisma/client.js";
import { DATA_PURGE_RETENTION_DAYS, DATA_PURGE_VERSION, type DataPurgeMode } from "../domain/data-purge.js";

const DAY_MS = 24 * 60 * 60 * 1_000;

export interface DataPurgeCounts {
  sessions: number;
  assessments: number;
  results: number;
  payments: number;
  subscriptions: number;
}

export interface DataPurgeSummary {
  version: typeof DATA_PURGE_VERSION;
  mode: DataPurgeMode;
  calculationTime: string;
  cutoffTime: string;
  outcome: "SUCCEEDED";
  candidates: DataPurgeCounts;
  deleted: DataPurgeCounts;
}

const zeroCounts = (): DataPurgeCounts => ({ sessions: 0, assessments: 0, results: 0, payments: 0, subscriptions: 0 });

export class DataPurgeService {
  constructor(private readonly prisma: PrismaClient) {}

  async purge(mode: DataPurgeMode, calculationTime: Date): Promise<DataPurgeSummary> {
    const cutoffTime = new Date(calculationTime.getTime() - DATA_PURGE_RETENTION_DAYS * DAY_MS);
    if (mode === "dry-run") {
      const candidates = await this.prisma.$transaction(
        (transaction) => this.collectCandidates(cutoffTime, transaction),
        { isolationLevel: "RepeatableRead" },
      );
      return this.summary(mode, calculationTime, cutoffTime, candidates.counts, zeroCounts());
    }

    const { candidates, deleted } = await this.prisma.$transaction(async (transaction) => {
      const snapshot = await this.collectCandidates(cutoffTime, transaction);
      const { sessionIds, assessmentIds, paymentIds } = snapshot;
      if (sessionIds.length === 0) return { candidates: snapshot.counts, deleted: zeroCounts() };

      await transaction.subscription.updateMany({
        where: { sessionId: { in: sessionIds }, activationPaymentId: { in: paymentIds } },
        data: { activationPaymentId: null },
      });
      const payments = await transaction.payment.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });
      const results = await transaction.assessmentResult.deleteMany({ where: { assessmentId: { in: assessmentIds } } });
      const assessments = await transaction.assessment.deleteMany({ where: { sessionId: { in: sessionIds } } });
      const subscriptions = await transaction.subscription.deleteMany({ where: { sessionId: { in: sessionIds } } });
      const sessions = await transaction.session.deleteMany({ where: { id: { in: sessionIds }, expiresAt: { lte: cutoffTime } } });
      const deleted = { sessions: sessions.count, assessments: assessments.count, results: results.count, payments: payments.count, subscriptions: subscriptions.count };
      for (const key of Object.keys(deleted) as (keyof DataPurgeCounts)[]) {
        if (deleted[key] !== snapshot.counts[key]) throw new Error("Purge candidate set changed during execution");
      }
      return {
        candidates: snapshot.counts,
        deleted,
      };
    }, { isolationLevel: "Serializable" });

    return this.summary(mode, calculationTime, cutoffTime, candidates, deleted);
  }

  private async collectCandidates(cutoffTime: Date, client: Pick<PrismaClient, "session" | "assessment" | "assessmentResult" | "payment" | "subscription"> = this.prisma) {
    const sessions = await client.session.findMany({ where: { expiresAt: { lte: cutoffTime } }, select: { id: true } });
    const sessionIds = sessions.map(({ id }) => id);
    const assessments = sessionIds.length === 0 ? [] : await client.assessment.findMany({ where: { sessionId: { in: sessionIds } }, select: { id: true } });
    const assessmentIds = assessments.map(({ id }) => id);
    const [results, payments, subscriptions] = sessionIds.length === 0 ? [[], [], []] : await Promise.all([
      client.assessmentResult.findMany({ where: { assessmentId: { in: assessmentIds } }, select: { id: true } }),
      client.payment.findMany({ where: { sessionId: { in: sessionIds } }, select: { id: true } }),
      client.subscription.findMany({ where: { sessionId: { in: sessionIds } }, select: { id: true } }),
    ]);
    return {
      sessionIds,
      assessmentIds,
      paymentIds: payments.map(({ id }) => id),
      counts: { sessions: sessions.length, assessments: assessments.length, results: results.length, payments: payments.length, subscriptions: subscriptions.length },
    };
  }

  private summary(mode: DataPurgeMode, calculationTime: Date, cutoffTime: Date, candidates: DataPurgeCounts, deleted: DataPurgeCounts): DataPurgeSummary {
    return { version: DATA_PURGE_VERSION, mode, calculationTime: calculationTime.toISOString(), cutoffTime: cutoffTime.toISOString(), outcome: "SUCCEEDED", candidates, deleted };
  }
}
