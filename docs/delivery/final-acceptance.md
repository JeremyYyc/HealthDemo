# Final acceptance record

This record must contain observed evidence only. Do not mark a pending item as passed and do not store a review code, Cookie, token, database URL, digest, or health answers here.

| Field | Evidence |
|---|---|
| Commit SHA | Local cold-clone acceptance: `b7ce76f348a27cf42d5119a46caa60bb740abbb0`; final merge pending |
| Production URL | Pending external deployment |
| Preview acceptance run | Pending external deployment |
| Production acceptance run | Pending external deployment |
| CI run | PR #12 quality gate pending for latest head |
| Test counts/results | Cold clone passed: check 22/22; integration 47/47; coverage 69/69; Chromium/WebKit E2E 40/40; build passed; npm audit 0 vulnerabilities |
| Paid Session smoke | Local cold-clone smoke passed all five checks; external Preview/Production smoke pending |
| Smoke operator/time (UTC) | Codex local acceptance, 2026-08-05T11:09:59Z; external operator/time pending |
| Known limitations | See README; update with observed deployment limits |
| All P0 satisfied | No — external Preview/Production evidence pending |
| Monitoring/alert recheck | Pending external deployment |
| Rollback recheck | Pending external deployment |
| Observation/review time | Pending external deployment |
| Release operator | Pending owner assignment |

## Release update procedure

1. Record the successful Preview `Deployment acceptance` run and its deployed commit.
2. Promote the same commit to Production; run acceptance with the Preview run URL input.
3. Record the public HTTPS URL, Production run, UTC operator/time, monitoring checks, limitations, and rollback evidence.
4. Change “All P0 satisfied” to “Yes” only if every row is complete and no S0/S1 remains.
