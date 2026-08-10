# Deployment guide

This guide covers the current Supabase PostgreSQL and Vercel deployment. Application startup never applies database migrations.

## Local Docker

The committed `docker-compose.yml` and `.env.example` configure local development. `DATABASE_URL` and `DIRECT_URL` both point to the local PostgreSQL instance; `TEST_DATABASE_URL` targets the isolated test database.

```bash
docker compose up -d
set -a
source .env
set +a
npm ci
npm run db:migrate
npm run demo:reset
npm run dev
```

Verify it with:

```bash
docker compose ps
curl --fail-with-body --silent http://localhost:3000/api/health | jq
```

If Docker started before `health_demo_test` was added to the init script, recreate only the local Compose volume after confirming it contains no needed data, or create the test database manually.

## Supabase PostgreSQL

The application uses Supabase only as managed PostgreSQL through Prisma. It does not require a browser-facing Supabase URL, anon/publishable key, or service-role key.

1. Create separate Preview and Production projects or databases.
2. Copy connection strings from the Supabase **Connect** panel rather than constructing hostnames manually.
3. Use the Shared Pooler transaction-mode URL, normally port `6543`, as runtime `DATABASE_URL`.
4. Use the direct URL on port `5432` as migration `DIRECT_URL` when the runner has IPv6 or the Supabase IPv4 add-on. Otherwise use the Shared Pooler session-mode URL on port `5432`.
5. Retain the supplied TLS parameters and URL-encode special password characters.
6. Run committed forward migrations from trusted CI or an operator environment before promotion.

`prisma.config.ts` uses `DIRECT_URL` for migration commands; the running application uses `DATABASE_URL`. Recheck `/api/health` and deployment smoke after pooler or Prisma upgrades.

The browser does not use the Supabase Data API. Do not grant `anon` or `authenticated` direct table access; disable the Data API if unused or keep the application schema unexposed.

References: [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres) and [Prisma integration](https://supabase.com/docs/guides/database/prisma).

## Vercel project

1. Import `JeremyYyc/HealthDemo`, or link it from the repository root with `npx vercel link`.
2. Keep the project root unchanged and let Vercel detect Next.js. Install with `npm ci` and build with `npm run build`.
3. Configure independent Preview and Production values:

| Variable | Rule |
|---|---|
| `DATABASE_URL` | matching Supabase transaction-pool URL |
| `SESSION_TOKEN_SECRET` | independent random value of at least 32 characters |
| `DEMO_EXCHANGE_ENABLED` | `true` only during controlled review |
| `DEMO_REVIEW_CODE_HASH` | digest generated for that database and environment |
| `DEMO_PAID_SESSION_TOKEN` | fixed synthetic credential generated for that database |
| `SESSION_COOKIE_SECURE` | omit or set `true` |
| `APP_VERSION` | optional release SHA; Vercel Git SHA is the fallback |

Keep `DIRECT_URL` in the trusted migration runner rather than the Next.js runtime unless a reviewed Vercel job genuinely needs it.

Ordinary Vercel deployments should omit `APP_BASE_URL`. The application resolves Production from `VERCEL_PROJECT_PRODUCTION_URL`, Preview from `VERCEL_BRANCH_URL`, then falls back to `VERCEL_URL`. Set `APP_BASE_URL` only when intentionally pinning one custom origin, then verify every write endpoint.

Environment changes require a redeploy. `npx vercel env pull .env.local --environment=development` overwrites the target file, so keep manual overrides separately and never commit `.env.local`.

Use Standard Protection: generated Preview/deployment URLs stay protected while the stable Production domain is public. Store the automation bypass value only as the `VERCEL_AUTOMATION_BYPASS_SECRET` GitHub Environment secret and send it through the `x-vercel-protection-bypass` header.

References: [Vercel environment variables](https://vercel.com/docs/environment-variables), [Deployment Protection](https://vercel.com/docs/deployment-protection), and [automation bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

## First hosted deployment

1. Create isolated Preview and Production databases and collect runtime and migration URLs.
2. Generate separate `SESSION_TOKEN_SECRET` values.
3. Apply `npm run db:migrate` to Preview from an ignored operator environment.
4. Run `npm run demo:reset`. It writes mode-`0600` `.env.demo.generated` containing the review code, digest, and fixed Session credentials.
5. Copy only `DEMO_REVIEW_CODE_HASH` and `DEMO_PAID_SESSION_TOKEN` into the matching Vercel environment, enable the exchange, and redeploy.
6. Put plaintext `DEMO_REVIEW_CODE` in the matching GitHub Environment secret and deliver it to the reviewer privately.
7. Deploy and accept Preview for the exact Git SHA.
8. Repeat migration, reset, secret configuration, and deployment for Production using Production-scoped values and the same Git SHA.
9. Confirm the stable Production domain and `/api/health` are public; keep generated URLs protected.

Running `demo:reset` again rotates the review code and fixed Session token. Update Vercel and GitHub secrets, redeploy, and privately resend the new review code.

Do not promote a Preview deployment built with Preview-only variables or a Preview database into Production. Promotion is valid only when the artifact was created with the correct Production configuration.

## Release gate

Every PR and push to `main` runs install/generation, typecheck, lint, unit/API tests, production build, PostgreSQL integration, coverage, Chromium/WebKit E2E, local delivery smoke, and the aggregate `quality-gate`.

Deployment acceptance must preserve this order:

1. Apply migrations and deploy the exact commit to Preview with an exact `APP_VERSION` when configured.
2. Run Preview acceptance and record the successful same-repository, same-commit Actions run.
3. Apply the Production migration, deploy the same commit with Production values, and run Production acceptance.
4. Smoke health, eight saves, completion, Free non-leakage, payment-to-Full, and paid Session exchange.
5. Record observed evidence in [final-acceptance.md](../delivery/final-acceptance.md).

Manual smoke equivalent:

```bash
SMOKE_BASE_URL="https://your-preview-or-production.example" \
SMOKE_ENVIRONMENT="preview" \
SMOKE_EXPECTED_COMMIT_SHA="the-full-deployed-commit-sha" \
SMOKE_REVIEW_CODE="the-controlled-review-code" \
SMOKE_REQUIRE_DEMO_EXCHANGE=true \
npm run smoke:deployment
```

Pass secrets through a secret manager rather than shared shell history or workflow YAML. See the [operations runbook](../operations/runbook.md) for release stops, rollback, observation, and rotation.
