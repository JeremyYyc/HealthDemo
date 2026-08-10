# Final acceptance record

This record must contain observed evidence only. Do not mark a pending item as passed and do not store a review code, Cookie, token, database URL, digest, or health answers here.

| Field | Evidence |
|---|---|
| Commit SHA | Accepted deployed application artifact: `6983596e5c599d5caae7be12479efab11145c535`; P0-12 PR #12 merged to `main` as `c38d44a1eb5c43a52cde714e29866376478aa93e`. The post-deployment delta before merge was evidence-only documentation. |
| Production URL | `https://health-demo-opal.vercel.app` (`READY`; unauthenticated `/` and `/api/health` both returned 200 on 2026-08-10T06:28Z). Generated deployment URLs remain protected; the stable production URL is public. |
| Preview acceptance run | `https://github.com/JeremyYyc/HealthDemo/actions/runs/31094134714` — succeeded for the deployed SHA |
| Production acceptance run | `https://github.com/JeremyYyc/HealthDemo/actions/runs/31094546471` — succeeded after validating the Preview evidence and deployed SHA |
| CI run | Deployed-SHA CI: `https://github.com/JeremyYyc/HealthDemo/actions/runs/31093891000`; merge-SHA CI: `https://github.com/JeremyYyc/HealthDemo/actions/runs/31165951530`. Both completed successfully; the merge-SHA run passed check, PostgreSQL integration, coverage, Chromium/WebKit E2E, deployment smoke, and `quality-gate`. |
| Test counts/results | Accepted cold clone passed: check 22/22; integration 47/47; coverage 69/69; Chromium/WebKit E2E 40/40; build passed; npm audit 0 vulnerabilities. External CI, Preview smoke, and Production smoke succeeded. Final documentation-sync `npm run check` passed locally on 2026-08-10 with 32/32 unit/API/architecture tests. |
| Paid Session smoke | Passed in local cold clone, Preview, Production, the post-rollback Production smoke, and the first, 2-hour, and 12-hour observation checkpoints; reverified against the public production URL on 2026-08-10T06:34Z with exchange 200, result 200, `FULL`, BMR present, and prediction curve present. No credential was recorded. |
| Smoke operator/time (UTC) | GitHub Actions/Codex under repository-owner authorization; final-SHA Production acceptance completed 2026-08-06T10:46:43Z; observation full smokes passed 2026-08-06T11:24:54Z, 2026-08-06T12:54:20Z, and 2026-08-06T22:54:37Z |
| Known limitations | See README: generated deployment URLs remain protected, while the stable Production URL is public; free-tier cold-start/connection/capacity limits are unmeasured; no production-scale load claim. |
| All P0 satisfied | Yes — implementation, CI, Preview/Production acceptance, rollback recheck, 12-hour observation, final evidence review, and PR #12 merge are complete. |
| Monitoring/alert recheck | Passed through 2026-08-06T22:54:37Z with no S0/S1, runtime errors, 5xx, or database connection errors; public database health and paid Session exchange were reverified on 2026-08-10. See the observation timeline below. |
| Rollback recheck | Passed: promoted the same-SHA artifact as `dpl_6BaNiACwE8mcwWHyQ46gjwteCKCU`, rolled back to previously smoke-passed `dpl_5VEizQb48J86jSvHrxKctNYaZvij`, confirmed alias/SHA/database health, then passed all five smoke checks at 2026-08-06T10:20:12Z |
| Observation/review time | Final-SHA observation ran from 2026-08-06T10:46:43Z through 2026-08-06T22:54:37Z. PR #12 merged on 2026-08-07T09:27:17Z; final evidence and public-access review completed on 2026-08-10T06:34:26Z. |
| Release operator | Codex under explicit authorization from repository owner JeremyYyc |

## Observation timeline

| Time (UTC) | Evidence |
|---|---|
| 2026-08-06T10:46:43Z | Final-SHA Production acceptance passed, including the complete deployment smoke. |
| 2026-08-06T11:24:54Z | Exact-SHA database health; no runtime errors or 5xx; all five deployment-smoke checks passed. |
| 2026-08-06T11:53:32Z | Exact-SHA database health; no runtime errors or 5xx; observed responses were 200/201 only. |
| 2026-08-06T12:23:39Z | Exact-SHA database health; no runtime errors or 5xx; observed responses were 200/201 only. |
| 2026-08-06T12:54:20Z | Two-hour checkpoint: exact-SHA database health; no runtime errors or 5xx; all five deployment-smoke checks passed. |
| 2026-08-06T13:23:36Z | Exact-SHA database health; no runtime errors or 5xx; observed responses were 200/201 only. |
| 2026-08-06T13:54:11Z | Exact-SHA database health; no runtime errors, 5xx, or current-deployment connection-error logs. |
| 2026-08-06T14:23:36Z | Exact-SHA database health; no runtime errors, 5xx, or current-deployment connection-error logs. |
| 2026-08-06T14:53:45Z | Exact-SHA database health; no runtime errors, 5xx, or current-deployment connection-error logs. |
| 2026-08-06T15:23:43Z | Exact-SHA database health; no runtime errors, 5xx, or current-deployment connection-error logs. |
| 2026-08-06T15:53:56Z | Exact-SHA database health; no runtime errors or 5xx; no connection-error logs since the prior checkpoint. |
| 2026-08-06T16:23:39Z | Exact-SHA database health; no runtime errors or 5xx; no connection-error logs since the prior checkpoint. |
| 2026-08-06T16:53:47Z | Exact-SHA database health; no runtime errors or 5xx; no connection-error logs since the prior checkpoint. |
| 2026-08-06T17:23:36Z | Exact-SHA database health; no runtime errors or 5xx; no connection-error logs since the prior checkpoint. |
| 2026-08-06T17:53:42Z | Exact-SHA database health; no runtime errors or 5xx; no connection-error logs since the prior checkpoint. |
| 2026-08-06T18:23:39Z | Exact-SHA database health; no runtime errors or 5xx; no connection-error logs since the prior checkpoint. |
| 2026-08-06T18:53:35Z | Exact-SHA database health; no runtime errors or 5xx; no connection-error logs since the prior checkpoint. |
| 2026-08-06T19:23:40Z | Exact-SHA database health; no runtime errors or 5xx; no connection-error logs since the prior checkpoint. |
| 2026-08-06T19:53:46Z | Exact-SHA database health; no runtime errors or 5xx; no connection-error logs since the prior checkpoint. |
| 2026-08-06T20:23:40Z | Exact-SHA database health; no runtime errors or 5xx; no connection-error logs since the prior checkpoint. |
| 2026-08-06T20:53:43Z | Exact-SHA database health; no runtime errors or 5xx; no connection-error logs since the prior checkpoint. |
| 2026-08-06T21:23:37Z | Exact-SHA database health; no runtime errors or 5xx; no connection-error logs since the prior checkpoint. |
| 2026-08-06T21:53:39Z | Exact-SHA database health; no runtime errors or 5xx; no connection-error logs since the prior checkpoint. |
| 2026-08-06T22:23:50Z | Final pre-gate heartbeat: exact-SHA database health; no runtime errors or 5xx; no connection-error logs since the prior checkpoint. |
| 2026-08-06T22:54:37Z | Twelve-hour final checkpoint: exact-SHA database health; no full-window runtime errors or 5xx; no connection-error logs since the prior checkpoint; all five deployment-smoke checks passed. No S0/S1 observed. |
| 2026-08-07T09:42:52Z | PR #12 merge-SHA CI completed successfully; all five required jobs and `quality-gate` passed on `c38d44a1eb5c43a52cde714e29866376478aa93e`. |
| 2026-08-10T06:34:26Z | Final evidence audit: PR #12 is merged; the stable Production URL is publicly reachable without Vercel login; health reports accepted SHA `6983596e5c599d5caae7be12479efab11145c535` and reachable database; paid Session exchange and Full result both returned 200; final documentation-sync `npm run check` passed with 32/32 tests. |

## Release update procedure

1. Record the successful Preview `Deployment acceptance` run and its deployed commit.
2. Promote the same commit to Production; run acceptance with the Preview run URL input.
3. Record the public HTTPS URL, Production run, UTC operator/time, monitoring checks, limitations, and rollback evidence.
4. Change “All P0 satisfied” to “Yes” only if every row is complete and no S0/S1 remains.
