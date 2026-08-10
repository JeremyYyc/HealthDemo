# Operations runbook

This runbook covers the public review period. Record only aggregate status, request IDs, and UTC times—never credentials, health answers, request bodies, or record-ID lists.

## Release checks and stop conditions

Release blockers are any S0 data or authorization leak, S1 main-flow/payment/recovery failure, migration failure, Free protected-field leak, coverage failure, or critical browser/deployment smoke failure.

Stop a release when:

- `/api/health` fails three consecutive checks;
- API 5xx exceeds 5% for five minutes;
- P95 latency remains above 800 ms for ten minutes; or
- database connection errors cluster.

The expected review load is at most 10 simultaneous visitors. A 20-Session concurrency smoke is only a basic check, not a production capacity claim.

## Rollback

1. Switch traffic to the last deployment that passed the complete smoke.
2. Prefer additive migrations compatible with the prior application.
3. If database repair is unavoidable, use a reviewed compensating migration. Never reset Production.
4. Re-run health, Free non-leakage, payment-to-Full, and paid Session exchange checks.
5. Observe twice in the first 30 minutes, then at 2 hours and 12 hours or through the end of review.

Record the deployment identifier, commit SHA, UTC time, aggregate smoke outcome, and relevant request IDs.

## Demo credential rotation

`npm run demo:reset` transactionally rebuilds the paid and unpaid synthetic Sessions and writes new credentials to owner-only `.env.demo.generated`.

```bash
set -a
source .env
npm run demo:reset
source .env.demo.generated
set +a
```

After rotation:

1. update the matching Vercel `DEMO_REVIEW_CODE_HASH` and `DEMO_PAID_SESSION_TOKEN`;
2. redeploy the target environment;
3. update the private GitHub Environment `DEMO_REVIEW_CODE` used by deployment smoke;
4. privately resend the plaintext review code;
5. verify the exchange and Full result; and
6. disable `DEMO_EXCHANGE_ENABLED` after review or on suspicious attempts.

Never publish or log the plaintext review code, Session token, digest, Cookie, database URL, or automation bypass secret.

## 30+7 retention purge

Ordinary Sessions expire 30 days after creation. The versioned purge selects only `Session.expiresAt <= calculationTime - 7 days` and deletes related records in one explicit short transaction.

Dry-run is the default:

```bash
npm run data:purge-expired
npm run data:purge-expired -- --calculation-time=2026-08-05T00:00:00.000Z
```

Deletion requires both confirmations:

```bash
npm run data:purge-expired -- \
  --calculation-time=2026-08-05T00:00:00.000Z \
  --execute \
  --confirm=PURGE_EXPIRED_DATA
```

During public review, record dry-run and execute summaries at least every seven days and once immediately after review ends. Store only the version, UTC calculation/cutoff time, mode, outcome, and aggregate candidate/deleted counts.

- Exit `1`: the transaction failed and rolled back.
- Exit `2`: arguments were invalid or deletion was not explicitly confirmed.

Investigate and retry. Never substitute a Production reset for the purge.

## Known operational gaps

- no formal production load or capacity report;
- unmeasured Vercel/Supabase free-tier cold-start and connection limits;
- no real payment-provider webhook, reconciliation, refund, or dispute workflow;
- no self-service deletion or consent/privacy-policy versioning; and
- no broad historical browser or assistive-technology audit.

These are declared limitations, not implied coverage.
