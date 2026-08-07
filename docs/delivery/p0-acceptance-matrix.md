# P0 acceptance and API traceability

This file is the stable PR/CI trace index for `MVP-PRD-v1.0-20260805`. A row identifies automated evidence; it does not claim that an external deployment smoke has run. GitHub `CI / quality-gate` blocks merge when any repository-level gate fails.

## API-01 through API-09

| API | Route | Normal / validation / authorization / replay-concurrency evidence |
|---|---|---|
| API-01 | `POST /api/sessions` | `session-lifecycle.test.ts` P0-02-T01/T02/T05; `api-guardrails.test.ts` P0-10-T01/T02 |
| API-02 | `GET /api/session` | `session-lifecycle.test.ts` P0-02-T03/T05/T06 |
| API-03 | `PATCH /api/assessments/:id/steps/:step` | `assessment-step-save.test.ts` P0-03-T01–T07, including replay and concurrent version conflict |
| API-04 | `POST /api/assessments/:id/complete` | `assessment-completion.test.ts` P0-06-T01–T06, including replay, rollback and concurrency |
| API-05 | `GET /api/assessments/:id/result` | `assessment-result-access.test.ts` P0-07-T01–T04; `funnel.spec.ts` P0-07-T05 |
| API-06 | `POST /api/pay` | `demo-payment.test.ts` P0-08-T01–T07, including invalid, unauthorized, replay and concurrent keys |
| API-07 | `POST /api/assessments` | `session-lifecycle.test.ts` P0-02-T02/T04/T05; `funnel.spec.ts` new-assessment recovery |
| API-08 | `GET /api/health` | `api-guardrails.test.ts` and `api-infrastructure.test.ts` P0-10-T05; deployment smoke |
| API-09 | `POST /api/demo/session-exchange` | `demo-exchange.test.ts` P0-09-T01–T05, including invalid code, authorization, limits and reset |

## Issue acceptance IDs

| Issue | Acceptance ID | Primary automated evidence |
|---|---|---|
| P0-01 | P0-01-T01 | `tests/integration/data-model.test.ts` catalog/enums/FKs |
| P0-01 | P0-01-T02 | `tests/integration/data-model.test.ts` partial in-progress uniqueness |
| P0-01 | P0-01-T03 | `tests/integration/data-model.test.ts` subscription/payment uniqueness |
| P0-01 | P0-01-T04 | `tests/integration/data-model.test.ts` Session-scoped idempotency |
| P0-01 | P0-01-T05 | `tests/integration/data-model.test.ts` empty and legacy forward migration |
| P0-02 | P0-02-T01 | `tests/integration/session-lifecycle.test.ts` atomic entry |
| P0-02 | P0-02-T02 | `tests/integration/session-lifecycle.test.ts` in-progress reuse |
| P0-02 | P0-02-T03 | `tests/integration/session-lifecycle.test.ts` deterministic restore |
| P0-02 | P0-02-T04 | `tests/integration/session-lifecycle.test.ts` concurrent explicit start |
| P0-02 | P0-02-T05 | `tests/integration/session-lifecycle.test.ts` expired/tampered Cookie |
| P0-02 | P0-02-T06 | `tests/integration/session-lifecycle.test.ts` answers/version/progress restore |
| P0-03 | P0-03-T01 | `tests/unit/assessment-steps.test.ts`, `tests/integration/assessment-step-save.test.ts` |
| P0-03 | P0-03-T02 | `tests/integration/assessment-step-save.test.ts` normalized replay/conflict |
| P0-03 | P0-03-T03 | `tests/integration/assessment-step-save.test.ts` age invalidation |
| P0-03 | P0-03-T04 | `tests/integration/assessment-step-save.test.ts` target invalidation |
| P0-03 | P0-03-T05 | `tests/integration/assessment-step-save.test.ts` ordering/prerequisites |
| P0-03 | P0-03-T06 | `tests/integration/assessment-step-save.test.ts` concurrent save |
| P0-03 | P0-03-T07 | `tests/unit/assessment-steps.test.ts`, integration metric normalization |
| P0-04 | P0-04-T01 | `tests/e2e/funnel.spec.ts`, `tests/e2e/real-backend.spec.ts` eight-step flow |
| P0-04 | P0-04-T02 | mock and PostgreSQL browser restore tests |
| P0-04 | P0-04-T03 | browser validation/transport retry tests |
| P0-04 | P0-04-T04 | first-visit/lost-session browser tests |
| P0-04 | P0-04-T05 | browser route guard tests |
| P0-04 | P0-04-T06 | keyboard/mobile browser test |
| P0-04 | P0-04-T07 | metric/imperial round-trip browser test |
| P0-05 | P0-05-T01 | `tests/unit/health-calculation.test.ts` sex/activity formula |
| P0-05 | P0-05-T02 | calculation numeric boundaries/NaN/Infinity |
| P0-05 | P0-05-T03 | exact BMI boundaries/rounding |
| P0-05 | P0-05-T04 | goal direction/BMI/104-week limits |
| P0-05 | P0-05-T05 | rounding and calorie floor |
| P0-05 | P0-05-T06 | UTC/leap/curve endpoints |
| P0-05 | P0-05-T07 | deterministic fixed input/version |
| P0-06 | P0-06-T01 | `tests/integration/assessment-completion.test.ts` unique Result |
| P0-06 | P0-06-T02 | missing/cross-field invalid completion |
| P0-06 | P0-06-T03 | calculation/write rollback |
| P0-06 | P0-06-T04 | stale/concurrent last save |
| P0-06 | P0-06-T05 | concurrent completion/replay |
| P0-06 | P0-06-T06 | completed metadata replay/no Full embed |
| P0-07 | P0-07-T01 | `tests/integration/assessment-result-access.test.ts` exact Free DTO |
| P0-07 | P0-07-T02 | exact Full DTO/ACTIVE entitlement |
| P0-07 | P0-07-T03 | no/other Session and unfinished assessment |
| P0-07 | P0-07-T04 | missing Result safe error/log |
| P0-07 | P0-07-T05 | `tests/e2e/funnel.spec.ts` HTML/API/DOM non-leakage |
| P0-08 | P0-08-T01 | `tests/integration/demo-payment.test.ts` activation/unlock |
| P0-08 | P0-08-T02 | replay/fingerprint conflict |
| P0-08 | P0-08-T03 | concurrent first payment |
| P0-08 | P0-08-T04 | ACTIVE new-key no-op |
| P0-08 | P0-08-T05 | cross-Session key isolation |
| P0-08 | P0-08-T06 | failure rollback/safe retry |
| P0-08 | P0-08-T07 | Session/ownership/schema/Origin/limit guards |
| P0-09 | P0-09-T01 | `tests/integration/demo-exchange.test.ts` canonical paid Cookie |
| P0-09 | P0-09-T02 | wrong code/extra fields/Origin/shared limit |
| P0-09 | P0-09-T03 | disabled/missing/misdirected/damaged fixture |
| P0-09 | P0-09-T04 | credential/digest non-disclosure |
| P0-09 | P0-09-T05 | reset rotation/recovery |
| P0-10 | P0-10-T01 | `tests/api/api-guardrails.test.ts` media/JSON/size/Origin |
| P0-10 | P0-10-T02 | Cookie/auth/resource non-enumeration |
| P0-10 | P0-10-T03 | frozen error envelope |
| P0-10 | P0-10-T04 | `tests/integration/api-infrastructure.test.ts` shared hashed limits |
| P0-10 | P0-10-T05 | health 200/503 and read-only probe |
| P0-11 | P0-11-T01 | `tests/integration/data-purge.test.ts` real CLI dry-run |
| P0-11 | P0-11-T02 | inclusive 30+7 boundary |
| P0-11 | P0-11-T03 | explicit FK deletion |
| P0-11 | P0-11-T04 | retained Session isolation |
| P0-11 | P0-11-T05 | forced rollback/idempotent repeat |
| P0-12 | P0-12-T01 | package scripts, README, CI jobs |
| P0-12 | P0-12-T02 | this matrix plus `delivery-traceability.test.ts` |
| P0-12 | P0-12-T03 | Vitest V8 thresholds and CI coverage artifact |
| P0-12 | P0-12-T04 | mock + real PostgreSQL Playwright suites, including Cookie loss |
| P0-12 | P0-12-T05 | README cold-clone checklist and local delivery smoke |
| P0-12 | P0-12-T06 | `deployment-acceptance.yml` + `smoke-deployment.mjs`; external run recorded separately |
| P0-12 | P0-12-T07 | CI `quality-gate`, severity/release/rollback rules in README |

## Current automated totals

- Unit/API/architecture without PostgreSQL: generated by `npm test`.
- PostgreSQL integration: generated by `npm run test:integration`.
- Coverage suite: both groups under V8; thresholds are executable configuration, not prose.
- Browser E2E: Chromium and WebKit, with real PostgreSQL enabled in CI.
- Deployment acceptance: Preview first, then Production with the Preview run URL recorded; both require paid Session exchange.
