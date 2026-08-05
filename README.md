# HealthDemo

HealthDemo is an anonymous health-assessment demo. Product behavior and frozen API contracts live under `docs/prd`.

## Local API checks

Set `APP_BASE_URL` to the exact application origin. Every `POST` and `PATCH` request requires both a JSON media type and that exact Origin (scheme, host, and port):

```bash
export APP_BASE_URL="http://localhost:3000"
export COOKIE_JAR="/tmp/health-demo-cookies.txt"

curl --fail-with-body \
  -X POST "${APP_BASE_URL}/api/sessions" \
  -H "Content-Type: application/json" \
  -H "Origin: ${APP_BASE_URL}" \
  -c "${COOKIE_JAR}" \
  -b "${COOKIE_JAR}" \
  --data '{"ageRange":"30_39"}'

curl --fail-with-body \
  -b "${COOKIE_JAR}" \
  "${APP_BASE_URL}/api/session"

curl --fail-with-body \
  -X POST "${APP_BASE_URL}/api/assessments" \
  -H "Content-Type: application/json" \
  -H "Origin: ${APP_BASE_URL}" \
  -b "${COOKIE_JAR}" \
  --data '{}'
```

The read-only health check does not create a Session or write to the database:

```bash
curl --fail-with-body "${APP_BASE_URL}/api/health"
```

The full setup, assessment, payment, demo-review, retention, and delivery guide is completed by P0-12.

## Paid Demo Session review

The exchange endpoint is optional and disabled by default. Generate fresh synthetic paid/unpaid Sessions and rotated local credentials with:

```bash
npm run demo:reset
set -a
source .env.demo.generated
set +a
```

The generated file is gitignored, created with owner-only permissions, and contains the only plaintext review code and tokens. The command output prints only its path and row counts. Restart the app after sourcing it, then exchange the review code without exposing the paid Session token:

```bash
export REVIEW_COOKIE_JAR="/tmp/health-demo-review-cookies.txt"

curl --fail-with-body \
  -X POST "${APP_BASE_URL}/api/demo/session-exchange" \
  -H "Content-Type: application/json" \
  -H "Origin: ${APP_BASE_URL}" \
  -c "${REVIEW_COOKIE_JAR}" \
  --data "{\"reviewCode\":\"${DEMO_REVIEW_CODE}\"}"

curl --fail-with-body \
  -b "${REVIEW_COOKIE_JAR}" \
  "${APP_BASE_URL}/api/assessments/20000000-0000-4000-8000-000000000001/result"
```

The exchange response and URL contain no Session token. Run `npm run demo:reset` again to replace the synthetic records and rotate every credential; the previous review code and cookies then stop working. Ordinary assessment and Demo payment flows do not depend on this endpoint.

## Demo data retention and purge

Anonymous Sessions expire 30 days after creation and remain eligible for audit/recovery for at most 7 additional days. The versioned purge uses `Session.expiresAt <= calculationTime - 7 days`; it never prints tokens, record IDs, or health fields. Dry-run is the default and does not write to the database:

```bash
npm run data:purge-expired
```

Use a fixed UTC time when an operator or CI run must be reproducible:

```bash
npm run data:purge-expired -- --calculation-time=2026-08-05T00:00:00.000Z
```

Formal deletion requires both explicit flags:

```bash
npm run data:purge-expired -- \
  --calculation-time=2026-08-05T00:00:00.000Z \
  --execute \
  --confirm=PURGE_EXPIRED_DATA
```

During a public review, the deployment owner runs and records the single-line JSON summary for dry-run and execute at least every 7 days. Run and record one final pair immediately after the review ends. The audit record contains only the command version, UTC calculation/cutoff times, mode, outcome, and aggregate candidate/deleted counts. A failed execute exits `1` and rolls back; invalid or unconfirmed usage exits `2`. Investigate failures before retrying—never use a production database reset as a substitute.
