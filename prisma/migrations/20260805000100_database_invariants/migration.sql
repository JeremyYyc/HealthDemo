-- PostgreSQL partial unique indexes are intentionally kept in reviewed SQL because
-- Prisma Schema cannot currently represent their predicates.
CREATE UNIQUE INDEX "assessments_one_in_progress_per_session"
  ON "assessments"("session_id")
  WHERE "status" = 'IN_PROGRESS';

CREATE UNIQUE INDEX "payments_one_succeeded_per_session"
  ON "payments"("session_id")
  WHERE "status" = 'SUCCEEDED';
