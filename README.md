# HealthDemo

## 1. Project and core flow

HealthDemo is an anonymous eight-step wellness assessment built for a reviewable full-stack demonstration. A visitor receives an HttpOnly Session Cookie, saves resumable answers, completes a deterministic server-side calculation, sees a deliberately limited Free result, and can use a replay-safe Demo payment to unlock the Full result. It is not a medical product and should only receive synthetic or non-sensitive demonstration data.

Core flow: `Session → eight saved steps → complete transaction → Free result → Demo payment → refetch → Full result`. A separate review-code exchange opens one fixed paid synthetic Session without putting its token in a URL or response body.

## 2. Online URL, health check, and demo status

- Production URL: **not provisioned in the current repository/account environment**.
- Health check after deployment: `${APP_BASE_URL}/api/health`.
- Release evidence: [final acceptance record](docs/delivery/final-acceptance.md).

P0-12 is not externally complete until the same commit passes Preview first and then Production through the `Deployment acceptance` workflow. Do not substitute localhost results or a placeholder URL for that evidence.

## 3. Technology stack and rationale

- Next.js 16 App Router + React 19: one Node.js application for UI and Route Handlers.
- TypeScript strict + Zod: compile-time checks plus strict runtime request schemas.
- Prisma 7 + PostgreSQL 16: explicit relations, unique constraints, partial indexes, and real transactions.
- Vitest + V8 coverage: fast unit/API tests and PostgreSQL integration coverage.
- Playwright: Chromium and WebKit browser flows against both mocked failure states and a real backend.
- GitHub Actions: lockfile install, lint, typecheck, build, migration/integration, coverage, E2E, smoke, and aggregate release gate.

Versions are locked in `package-lock.json`; use Node.js 22 or newer.

## 4. Architecture and directory map

```text
Browser UI (app/, src/ui/)
        ↓ same-origin JSON + HttpOnly Cookie
Route handlers (app/api/ → src/api/routes/)
        ↓ strict guard / auth / domain validation
Services (src/services/)
        ↓ Prisma transactions
PostgreSQL (prisma/schema.prisma + forward migrations)
```

| Path | Responsibility |
|---|---|
| `app/` | App Router pages and thin Node.js Route Handlers |
| `src/api/` | request guards, error envelope, auth, limits, route adapters |
| `src/domain/` | pure validation, DTO permissions, calculation, frozen constants |
| `src/services/` | Session, assessment, result, payment, exchange, purge transactions |
| `prisma/` | reviewed schema and forward migrations |
| `scripts/` | Demo reset, retention purge, deployment smoke |
| `tests/` | unit, API, architecture, PostgreSQL integration, Playwright |
| `docs/delivery/` | traceability and observed release evidence |

## 5. ER model and state machines

```mermaid
erDiagram
  SESSION ||--o{ ASSESSMENT : owns
  SESSION ||--o| SUBSCRIPTION : has
  SESSION ||--o{ PAYMENT : makes
  ASSESSMENT ||--o| ASSESSMENT_RESULT : produces
  ASSESSMENT ||--o{ PAYMENT : unlock_source
  PAYMENT o|--o| SUBSCRIPTION : activates

  SESSION {
    uuid id PK
    varchar tokenHash UK
    timestamptz expiresAt
  }
  ASSESSMENT {
    uuid id PK
    uuid sessionId FK
    enum status
    int version
  }
  ASSESSMENT_RESULT {
    uuid id PK
    uuid assessmentId FK_UK
    varchar algorithmVersion
  }
  SUBSCRIPTION {
    uuid id PK
    uuid sessionId FK_UK
    uuid activationPaymentId FK_UK
  }
  PAYMENT {
    uuid id PK
    uuid sessionId FK
    uuid assessmentId FK
    varchar idempotencyKey
    varchar transactionId UK
  }
```

PostgreSQL additionally enforces one `IN_PROGRESS` Assessment and one `SUCCEEDED` first Payment per Session through partial unique indexes. Assessment moves `IN_PROGRESS → COMPLETED`; Demo payment atomically creates one `SUCCEEDED` Payment and changes Subscription `INACTIVE → ACTIVE`. Replays never create a second entitlement.

## 6. Environment variables and local startup

Prerequisites: Node.js 22+, npm, Docker with Compose, `curl`, and `jq` for the documented API walk-through.

| Variable | Use | Local example / production rule |
|---|---|---|
| `DATABASE_URL` | application runtime PostgreSQL | local URL; production transaction-pool URL |
| `DIRECT_URL` | Prisma migration connection | local URL; production direct non-pool URL |
| `TEST_DATABASE_URL` | isolated tests only | dedicated `health_demo_test` database |
| `APP_BASE_URL` | exact allowed Origin | `http://localhost:3000`; exact deployed HTTPS origin |
| `SESSION_TOKEN_SECRET` | HMAC for opaque credentials | at least 32 random characters; secret |
| `SESSION_COOKIE_SECURE` | override Cookie Secure flag | `false` locally; omit/`true` in production |
| `APP_VERSION` | safe health-check version | deployed commit or release tag |
| `DEMO_EXCHANGE_ENABLED` | review exchange kill switch | disabled until controlled Seed is ready |
| `DEMO_REVIEW_CODE_HASH` | server-only review-code HMAC | generated; never commit |
| `DEMO_PAID_SESSION_TOKEN` | fixed paid Session credential | generated; never commit |

Fresh local setup:

```bash
git clone https://github.com/JeremyYyc/HealthDemo.git
cd HealthDemo
cp .env.example .env
npm ci
docker compose up -d
set -a
source .env
set +a
npm run db:migrate
npm run demo:reset
npm run dev
```

Open `http://localhost:3000`. PostgreSQL is exposed only for local development at `localhost:55432`. If Docker started before `health_demo_test` was added to the init script, recreate only the local Compose volume after confirming it contains no needed data, or create that test database manually.

## 7. Database migrations and Demo Seed

- Apply reviewed forward migrations with `npm run db:migrate`; never run `db push` or an automatic migration from a Serverless application startup.
- CI applies migrations to empty temporary databases and also verifies the legacy-to-current forward path.
- Production migration uses `DIRECT_URL` before the new application is promoted; runtime uses `DATABASE_URL`.
- `npm run demo:reset` transactionally rebuilds one paid and one unpaid synthetic Session and rotates every credential into owner-only `.env.demo.generated`.
- Source the generated file, restart the app, and never paste its plaintext values into Git, logs, URLs, issues, or acceptance records.

```bash
set -a
source .env
npm run demo:reset
source .env.demo.generated
set +a
```

## 8. API reference and executable Cookie-Jar cURL flow

| API | Method and path | Purpose |
|---|---|---|
| API-01 | `POST /api/sessions` | create/reuse anonymous Session and first Assessment |
| API-02 | `GET /api/session` | restore current server state |
| API-03 | `PATCH /api/assessments/:id/steps/:step` | strict versioned step save |
| API-04 | `POST /api/assessments/:id/complete` | calculate and persist Result atomically |
| API-05 | `GET /api/assessments/:id/result` | return exact Free or Full DTO |
| API-06 | `POST /api/pay` | idempotent synchronous Demo payment |
| API-07 | `POST /api/assessments` | explicitly start/reuse a new assessment |
| API-08 | `GET /api/health` | read-only application/database health |
| API-09 | `POST /api/demo/session-exchange` | exchange review code for fixed paid Cookie |

The following commands are executable in Bash after local startup. Every write sends JSON and the exact Origin. The first `age-range` PATCH deliberately demonstrates the idempotent first-step replay, so all eight step endpoints are exercised.

```bash
export APP_BASE_URL="http://localhost:3000"
export COOKIE_JAR="/tmp/health-demo-cookies.txt"

curl --fail-with-body --silent "${APP_BASE_URL}/api/health" | jq

ENTRY_RESPONSE=$(curl --fail-with-body --silent \
  -X POST "${APP_BASE_URL}/api/sessions" \
  -H "Content-Type: application/json" \
  -H "Origin: ${APP_BASE_URL}" \
  -c "${COOKIE_JAR}" -b "${COOKIE_JAR}" \
  --data '{"ageRange":"30_39"}')

ASSESSMENT_ID=$(printf '%s' "${ENTRY_RESPONSE}" | jq -r '.data.assessment.id')
VERSION=$(printf '%s' "${ENTRY_RESPONSE}" | jq -r '.data.assessment.version')

save_step() {
  local slug="$1"
  local answer="$2"
  local payload response
  payload=$(jq -cn --argjson answer "${answer}" --argjson version "${VERSION}" '$answer + {version: $version}')
  response=$(curl --fail-with-body --silent \
    -X PATCH "${APP_BASE_URL}/api/assessments/${ASSESSMENT_ID}/steps/${slug}" \
    -H "Content-Type: application/json" \
    -H "Origin: ${APP_BASE_URL}" \
    -b "${COOKIE_JAR}" --data "${payload}")
  VERSION=$(printf '%s' "${response}" | jq -r '.data.version')
}

save_step age-range '{"ageRange":"30_39"}'
save_step sex '{"sex":"FEMALE"}'
save_step goal '{"goal":"LOSE_WEIGHT"}'
save_step age '{"age":35}'
save_step height '{"heightCm":170}'
save_step current-weight '{"weightKg":80}'
save_step target-weight '{"targetWeightKg":70}'
save_step activity '{"activityLevel":"MODERATE"}'

curl --fail-with-body --silent \
  -X POST "${APP_BASE_URL}/api/assessments/${ASSESSMENT_ID}/complete" \
  -H "Content-Type: application/json" \
  -H "Origin: ${APP_BASE_URL}" \
  -b "${COOKIE_JAR}" --data "{\"version\":${VERSION}}" | jq

FREE_RESPONSE=$(curl --fail-with-body --silent \
  -b "${COOKIE_JAR}" "${APP_BASE_URL}/api/assessments/${ASSESSMENT_ID}/result")
printf '%s' "${FREE_RESPONSE}" | jq -e '
  .data.accessLevel == "FREE" and
  ([.data | has("bmrKcal"), has("tdeeKcal"), has("recommendedCaloriesKcal"), has("predictionCurve")] | any | not)'

export PAYMENT_KEY="demo_$(node -e 'console.log(crypto.randomUUID())')"
curl --fail-with-body --silent \
  -X POST "${APP_BASE_URL}/api/pay" \
  -H "Content-Type: application/json" \
  -H "Origin: ${APP_BASE_URL}" \
  -b "${COOKIE_JAR}" \
  --data "{\"assessmentId\":\"${ASSESSMENT_ID}\",\"idempotencyKey\":\"${PAYMENT_KEY}\"}" | jq

# A retry must reuse the same PAYMENT_KEY and identical assessmentId.
curl --fail-with-body --silent \
  -X POST "${APP_BASE_URL}/api/pay" \
  -H "Content-Type: application/json" \
  -H "Origin: ${APP_BASE_URL}" \
  -b "${COOKIE_JAR}" \
  --data "{\"assessmentId\":\"${ASSESSMENT_ID}\",\"idempotencyKey\":\"${PAYMENT_KEY}\"}" | jq

curl --fail-with-body --silent \
  -b "${COOKIE_JAR}" "${APP_BASE_URL}/api/assessments/${ASSESSMENT_ID}/result" \
  | jq -e '.data.accessLevel == "FULL" and .data.bmrKcal and .data.predictionCurve'
```

## 9. Demo payment and idempotency

Identity comes only from the Session Cookie; the body cannot choose a Session. A payment key is unique within one Session. Same key + same assessment is a replay; same key + different assessment is `409`; different simultaneous first keys serialize into one successful Payment; a new key after `ACTIVE` is a no-op and creates no record. Payment insert and Subscription activation share one database transaction. Browser retry retains the original key until Full Result refetch succeeds.

## 10. Fixed paid Session and review-code exchange

After `demo:reset` and sourcing `.env.demo.generated`, restart the app and run:

```bash
export REVIEW_COOKIE_JAR="/tmp/health-demo-review-cookies.txt"

curl --fail-with-body --silent \
  -X POST "${APP_BASE_URL}/api/demo/session-exchange" \
  -H "Content-Type: application/json" \
  -H "Origin: ${APP_BASE_URL}" \
  -c "${REVIEW_COOKIE_JAR}" \
  --data "{\"reviewCode\":\"${DEMO_REVIEW_CODE}\"}" | jq

curl --fail-with-body --silent \
  -b "${REVIEW_COOKIE_JAR}" \
  "${APP_BASE_URL}/api/assessments/20000000-0000-4000-8000-000000000001/result" \
  | jq -e '.data.accessLevel == "FULL"'
```

The response and URL never contain a Session token. The server validates canonical synthetic Session, Subscription, Payment, Assessment, and Result invariants. Five attempts per source IP per 15 minutes are shared in PostgreSQL. Disable the endpoint immediately after review or on suspicious attempts.

## 11. Tests, coverage, and cold-clone verification

Start the dedicated local databases first, load `.env`, and install browser binaries once:

```bash
docker compose up -d
set -a
source .env
set +a
npx playwright install chromium webkit

npm test
npm run test:integration
E2E_REAL_BACKEND=true DATABASE_URL="${TEST_DATABASE_URL}" DIRECT_URL="${TEST_DATABASE_URL}" \
  APP_BASE_URL="http://127.0.0.1:3100" SESSION_COOKIE_SECURE=false \
  npm run test:e2e
npm run test:coverage
npm run check
```

`test:coverage` runs unit/API/architecture and PostgreSQL integration tests together. Enforced minimums are statements/lines/functions ≥80%; health calculation branch coverage ≥90%; Free/Full permission DTO and service branch coverage ≥90%. The current measured local baseline is recorded by CI, never manually copied as a permanent claim. Browser E2E covers new visitor, restore, illegal input, payment unlock, established Cookie loss, first-visit distinction, and route guards in Chromium and WebKit. Large-scale load, real payment-provider signatures/refunds, and full historical browser matrices are intentionally outside this MVP.

For a cold-clone acceptance, follow sections 6–8 without reusing `.env`, Docker volumes, cookies, `node_modules`, or Demo credentials; then run every frozen command and `npm run smoke:deployment` against that local server. Record only pass/fail, commit, UTC time, and aggregate test counts.

## 12. CI, Preview, Production, smoke, and release gate

Every PR and push to `main` runs:

1. `npm ci`, Prisma generate, strict typecheck, ESLint with zero warnings, unit/API tests, and production build.
2. PostgreSQL integration tests.
3. V8 coverage thresholds with a 14-day report artifact.
4. Chromium + WebKit E2E against a real temporary PostgreSQL backend.
5. A full API delivery smoke against a built local production server.
6. `quality-gate`, which fails unless all five jobs succeeded.

`main` branch protection enforces an up-to-date `quality-gate` plus `independent-agent-review` status bound to the current PR head SHA, applies to administrators, requires resolved review conversations, and forbids force pushes or deletion. Publish the review status only after an independent Agent approves that exact SHA; any later push invalidates it.

Deployment is deliberately separate from Serverless startup. Required order:

1. Apply migrations to a temporary database and deploy the exact commit to Preview, with `APP_VERSION` set to its full commit SHA. Acceptance fails if `/api/health` reports any other version.
2. Set `DEPLOYMENT_PREVIEW_URL`, `DEPLOYMENT_PRODUCTION_URL`, and later `DEPLOYMENT_PREVIEW_RUN_URL` as GitHub repository variables. Set `DEMO_REVIEW_CODE` and `VERCEL_AUTOMATION_BYPASS_SECRET` in both GitHub Environments.
3. Before this workflow reaches `main`, add the `deployment-preview` PR label to invoke the environment-scoped Preview acceptance job from the existing CI workflow. Record that successful same-commit Actions run URL in `DEPLOYMENT_PREVIEW_RUN_URL`.
4. Only after Preview passes, apply the production migration using `DIRECT_URL`, promote the same commit, and add `deployment-production`. Production rejects evidence unless it is a successful same-repository, same-commit Preview acceptance run.
5. Once the workflow is on `main`, `Deployment acceptance` can also be dispatched manually with the same inputs and verification rules.
6. The smoke checks health, eight saves, complete, Free non-leakage, payment→Full, and paid Session exchange. Its output contains stages and aggregate check names only.
7. Fill [final acceptance record](docs/delivery/final-acceptance.md). A green merge CI is not Production evidence.

Manual equivalent:

```bash
SMOKE_BASE_URL="https://your-preview-or-production.example" \
SMOKE_ENVIRONMENT="preview" \
SMOKE_EXPECTED_COMMIT_SHA="the-full-deployed-commit-sha" \
SMOKE_REVIEW_CODE="the-controlled-review-code" \
SMOKE_REQUIRE_DEMO_EXCHANGE=true \
npm run smoke:deployment
```

Never place the review code directly in a shared shell history or CI YAML; use a secret manager in real environments.

## 13. Health algorithm and disclaimer

The frozen `v1` engine uses Mifflin–St Jeor BMR, fixed activity factors, BMI categories, deterministic calorie adjustment, a 1,200 kcal floor, a maximum 104-week plan, and UTC date-only prediction points. Result snapshots retain `algorithmVersion`; future formulas affect only new results. The UI and API state clearly that output is a general wellness estimate, not medical advice, diagnosis, treatment, or a substitute for professional care.

## 14. Security, privacy, concurrency, and transactions

- Random Session tokens are stored only as HMAC digests; the credential lives in an HttpOnly, SameSite=Lax, production-Secure Cookie.
- Every write requires strict JSON, ≤16 KiB body, and exact `scheme + host + port` Origin.
- Cross-Session resources are not enumerated. Free DTO construction is an allowlist; protected fields do not exist in Free JSON/HTML/DOM.
- Rate-limit keys are HMAC digests stored in PostgreSQL, so limits work across instances without retaining source addresses.
- Optimistic versions and partial unique indexes protect step saves; completion and payment use short database transactions and uniqueness constraints.
- Logs and audit summaries must not contain Cookies, tokens, review codes, digests, complete request bodies, record ID lists, or health answers. Retain `requestId`, stage, time, status, and aggregate counts only.

## 15. AI-assisted development retrospective

AI assisted with PRD-to-Issue decomposition, Schema alternatives, calculation/test case enumeration, API guardrails, transaction failure tests, E2E scaffolding, and documentation checks. Human verification remained responsible for formula comparison, frozen-contract interpretation, migration review, database constraints, secret handling, running real tests, reviewing every PR in an independent Agent, and deciding whether evidence was sufficient to merge.

Rejected AI suggestions included a generic EAV questionnaire model (too flexible for a frozen eight-field MVP), client-side masking of Full Result data (not authorization), storing prediction curves as strings (loses typed JSON semantics), in-memory Serverless rate limits (not cross-instance), and adapting this PostgreSQL application to an incompatible hosting database merely to obtain a URL. AI accelerated breadth and adversarial cases, but also increased risks of over-engineering, false-positive lint changes, and confident claims without external evidence; executable gates and independent review were used to contain those risks.

## 16. Known limitations, monitoring, rollback, and future evolution

Known limitations: anonymous Demo only; no self-service deletion; no consent/privacy-policy versioning; one calculation algorithm; one synchronous fake payment provider; no refunds; no production-scale load claim; and Vercel/Supabase free-tier cold-start, connection, and capacity limits are not yet measured. Production is available at `https://health-demo-opal.vercel.app`, but Vercel Deployment Protection means browser reviewers need authorized Vercel access. Expected review load is ≤10 simultaneous visitors; only basic 20-Session concurrency smoke is in scope, not a formal load report.

Release blockers: any S0 data/authorization leak; any S1 main flow/payment/recovery failure; migration failure; Free protected-field leak; coverage threshold failure; or critical E2E/smoke failure. During release, stop if `/api/health` fails three times, API 5xx exceeds 5% for five minutes, P95 remains >800 ms for ten minutes, or database connection errors cluster. Record request IDs and times, never credentials or health data.

Rollback means switching to the last smoke-passed application deployment. Prefer additive migrations compatible with the previous app; if database repair is unavoidable, use a reviewed compensating migration—never production reset. Rebuild synthetic Demo data only with the versioned reset and rotate credentials. After rollback, repeat health, Free non-leakage, payment→Full, and paid Session checks. Observe for at least 12 hours or through review completion: twice in the first 30 minutes, then at 2 and 12 hours. Future work includes deletion/consent/privacy controls, real provider security, telemetry, accessible localization, and measured capacity planning.

## 17. 30+7 retention purge and operator record

Ordinary Sessions expire 30 days after creation. A versioned purge selects only `Session.expiresAt <= calculationTime - 7 days`, removes related entities in an explicit short transaction, and emits aggregate-only JSON. Dry-run is the safe default:

```bash
npm run data:purge-expired
npm run data:purge-expired -- --calculation-time=2026-08-05T00:00:00.000Z
```

Formal deletion requires both flags:

```bash
npm run data:purge-expired -- \
  --calculation-time=2026-08-05T00:00:00.000Z \
  --execute \
  --confirm=PURGE_EXPIRED_DATA
```

The deployment owner records the single-line dry-run and execute summaries at least every seven days during public review and once immediately after review ends. Store only version, UTC calculation/cutoff time, mode, outcome, and aggregate candidate/deleted counts. Exit `1` means the transaction failed and rolled back; exit `2` means invalid or unconfirmed use. Investigate, then retry—never replace purge with a production reset.
