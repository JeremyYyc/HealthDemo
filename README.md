# HealthDemo

HealthDemo is an anonymous eight-step wellness assessment built as a reviewable full-stack demonstration. It saves resumable answers, performs deterministic server-side calculations, returns a deliberately limited Free result, and uses a replay-safe Demo payment to unlock the Full result.

It is not a medical product. Use synthetic or non-sensitive demonstration data only.

## Demo

| Entry point | URL |
|---|---|
| Production | <https://health-demo-opal.vercel.app> |
| Health check | <https://health-demo-opal.vercel.app/api/health> |
| Final acceptance evidence | [docs/delivery/final-acceptance.md](docs/delivery/final-acceptance.md) |
| Chinese delivery summary | [docs/最终交付总结.md](docs/最终交付总结.md) |

The stable Production domain is public. Generated Preview and deployment URLs remain protected by Vercel Authentication.

## Core flow

```text
Session → eight saved steps → complete → Free result → Demo payment → Full result
```

- An HttpOnly Cookie identifies an anonymous Session; request bodies cannot select a Session.
- Each step is validated and saved with optimistic versioning, so progress can be restored after interruption.
- Completion atomically calculates and stores BMI, BMR, TDEE, recommended calories, target date, and a prediction curve.
- Free and Full responses are separate server-side allowlisted DTOs. Protected fields never enter Free JSON, HTML, or the DOM.
- Demo payment is transactional and idempotent. A replay returns the original result without creating another entitlement.
- A private review code can exchange directly for the fixed paid synthetic Session without exposing its token.

## Stack and architecture

- Next.js 16 App Router and React 19
- strict TypeScript and Zod runtime schemas
- Prisma 7 and PostgreSQL 16
- Vitest with V8 coverage
- Playwright in Chromium and WebKit
- GitHub Actions release gates and Vercel deployment

Use Node.js 22 or newer. Exact dependency versions are locked in `package-lock.json`.

```text
Browser UI (app/, src/ui/)
        ↓ same-origin JSON + HttpOnly Cookie
Route handlers (app/api/ → src/api/routes/)
        ↓ request guards, authorization, domain validation
Services (src/services/)
        ↓ Prisma transactions
PostgreSQL (prisma/schema.prisma + forward migrations)
```

| Path | Responsibility |
|---|---|
| `app/` | App Router pages and thin Route Handlers |
| `src/api/` | request guards, authentication, limits, and route adapters |
| `src/domain/` | pure validation, result permissions, calculation, and constants |
| `src/services/` | Session, assessment, result, payment, exchange, and purge transactions |
| `prisma/` | schema and reviewed forward migrations |
| `scripts/` | Demo reset, retention purge, and deployment smoke |
| `tests/` | unit, API, architecture, PostgreSQL integration, and browser tests |

The complete ER model, partial indexes, and migration policy are documented in [docs/architecture/data-model.md](docs/architecture/data-model.md).

## Quick start

Prerequisites: Node.js 22+, npm, Docker with Compose, `curl`, and `jq`.

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

Open <http://localhost:3000>. Local PostgreSQL listens on `localhost:55432`.

Important environment variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | application PostgreSQL connection |
| `DIRECT_URL` | trusted migration connection |
| `TEST_DATABASE_URL` | isolated integration/E2E database |
| `SESSION_TOKEN_SECRET` | HMAC secret for opaque credentials; minimum 32 characters |
| `SESSION_COOKIE_SECURE` | use `false` locally; omit or use `true` in Production |
| `DEMO_EXCHANGE_ENABLED` | controlled review exchange kill switch |
| `DEMO_REVIEW_CODE_HASH` | server-only review-code digest |
| `DEMO_PAID_SESSION_TOKEN` | server-only fixed synthetic Session credential |

Secrets belong in ignored environment files or a secret manager. Never commit generated Demo credentials. See the [deployment guide](docs/guides/deployment.md) for Supabase, Vercel, Preview, and Production setup.

## Common commands

```bash
npm run check             # generate, typecheck, lint, and unit/API tests
npm run test:integration  # PostgreSQL integration tests
npm run test:coverage     # coverage gates
npm run test:e2e          # production build plus Chromium/WebKit tests
npm run smoke:deployment  # deployed end-to-end API smoke
```

The CI `quality-gate` requires typecheck, lint, unit/API tests, PostgreSQL integration, coverage, browser E2E, build, and delivery smoke to pass. Current observed results belong in the [final acceptance record](docs/delivery/final-acceptance.md), rather than being copied into this README.

## API overview

| API | Method and path | Purpose |
|---|---|---|
| API-01 | `POST /api/sessions` | create or reuse an anonymous Session and first Assessment |
| API-02 | `GET /api/session` | restore current server state |
| API-03 | `PATCH /api/assessments/:id/steps/:step` | strictly validate and version a step save |
| API-04 | `POST /api/assessments/:id/complete` | atomically calculate and persist a Result |
| API-05 | `GET /api/assessments/:id/result` | return the exact Free or Full DTO |
| API-06 | `POST /api/pay` | perform an idempotent synchronous Demo payment |
| API-07 | `POST /api/assessments` | explicitly start or reuse a new Assessment |
| API-08 | `GET /api/health` | report application and database health |
| API-09 | `POST /api/demo/session-exchange` | exchange a review code for the fixed paid Cookie |

The [executable Cookie-Jar walkthrough](docs/guides/api-walkthrough.md) exercises all eight saves, completion, Free non-leakage, payment replay, Full access, and the paid Session exchange. Exact request/response contracts are in [docs/prd/03-api-product-contract.md](docs/prd/03-api-product-contract.md).

## Security and data lifecycle

- Session tokens are stored only as HMAC digests; credentials live in HttpOnly, SameSite=Lax, production-Secure Cookies.
- Every write requires strict JSON, a body of at most 16 KiB, and an exact `scheme + host + port` Origin.
- Cross-Session resources are not enumerable, and Free DTO construction is an allowlist.
- PostgreSQL-backed HMAC rate-limit keys coordinate across instances without retaining source addresses.
- Short transactions, advisory locks, optimistic versions, and unique indexes protect concurrent state changes.
- Logs and audit summaries exclude Cookies, tokens, review codes, health answers, request bodies, and record-ID lists.
- Ordinary Sessions expire after 30 days and become purge candidates after a further 7-day grace period.

Operational thresholds, rollback, credential rotation, and safe purge commands are in the [operations runbook](docs/operations/runbook.md).

## Documentation

| Document | Purpose |
|---|---|
| [Product requirements](docs/prd/README.md) | frozen product, funnel, API, data, calculation, payment, quality, and delivery specifications |
| [P0 implementation package](docs/issues/p0/README.md) | development decomposition, dependencies, and acceptance cases |
| [Data model](docs/architecture/data-model.md) | ER model, constraints, and migration policy |
| [API walkthrough](docs/guides/api-walkthrough.md) | executable local Free → payment replay → Full flow |
| [Deployment guide](docs/guides/deployment.md) | Supabase/Vercel configuration and release order |
| [Operations runbook](docs/operations/runbook.md) | monitoring, rollback, Demo rotation, and retention purge |
| [Acceptance matrix](docs/delivery/p0-acceptance-matrix.md) | requirement-to-test and PR/CI traceability |
| [Final acceptance](docs/delivery/final-acceptance.md) | exact deployed SHA, CI runs, smoke, rollback, and observation evidence |

## Known limitations

This is an anonymous demonstration with one calculation algorithm and one synchronous fake payment provider. It has no self-service deletion, consent/privacy-policy versioning, refunds, disputes, provider webhooks, or production-scale capacity claim. Free-tier cold-start, database connection, and capacity limits have not been formally measured.

The calculation is a general wellness estimate, not medical advice, diagnosis, treatment, or a substitute for professional care.
