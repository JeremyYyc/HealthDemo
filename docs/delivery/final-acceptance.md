# Final acceptance record

This record must contain observed evidence only. Do not mark a pending item as passed and do not store a review code, Cookie, token, database URL, digest, or health answers here.

| Field | Evidence |
|---|---|
| Commit SHA | Deployed application artifact: `802c0697d1c6a608994be3c5ca4b4c845d77c792`; final evidence-only documentation head and merge pending |
| Production URL | `https://health-demo-opal.vercel.app` (`READY`, Vercel Deployment Protection enabled) |
| Preview acceptance run | `https://github.com/JeremyYyc/HealthDemo/actions/runs/31091530119` — succeeded for the deployed SHA |
| Production acceptance run | `https://github.com/JeremyYyc/HealthDemo/actions/runs/31091821522` — succeeded after validating the Preview evidence and deployed SHA |
| CI run | `https://github.com/JeremyYyc/HealthDemo/actions/runs/31091340931` — all jobs and `quality-gate` succeeded; the two acceptance runs repeated the same complete CI successfully |
| Test counts/results | Cold clone passed: check 22/22; integration 47/47; coverage 69/69; Chromium/WebKit E2E 40/40; build passed; npm audit 0 vulnerabilities. External CI, Preview smoke, and Production smoke succeeded. |
| Paid Session smoke | Passed in local cold clone, Preview, Production, and the post-rollback Production smoke |
| Smoke operator/time (UTC) | GitHub Actions/Codex under repository-owner authorization; Production acceptance 2026-08-06T10:06:06Z; post-rollback smoke 2026-08-06T10:20:12Z |
| Known limitations | See README: protected browser access, unmeasured free-tier cold-start/connection/capacity limits, and no production-scale load claim |
| All P0 satisfied | No — 12-hour observation, final evidence update/review, and PR merge remain |
| Monitoring/alert recheck | Initial Production acceptance and second full post-rollback smoke passed within the first 30 minutes; 2-hour and 12-hour checks pending |
| Rollback recheck | Passed: promoted the same-SHA artifact as `dpl_6BaNiACwE8mcwWHyQ46gjwteCKCU`, rolled back to previously smoke-passed `dpl_5VEizQb48J86jSvHrxKctNYaZvij`, confirmed alias/SHA/database health, then passed all five smoke checks at 2026-08-06T10:20:12Z |
| Observation/review time | Started 2026-08-06T10:06:06Z; 12-hour checkpoint due 2026-08-06T22:06:06Z; review completion also required if later |
| Release operator | Codex under explicit authorization from repository owner JeremyYyc |

## Release update procedure

1. Record the successful Preview `Deployment acceptance` run and its deployed commit.
2. Promote the same commit to Production; run acceptance with the Preview run URL input.
3. Record the public HTTPS URL, Production run, UTC operator/time, monitoring checks, limitations, and rollback evidence.
4. Change “All P0 satisfied” to “Yes” only if every row is complete and no S0/S1 remains.
