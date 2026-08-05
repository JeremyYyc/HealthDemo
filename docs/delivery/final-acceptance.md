# Final acceptance record

This record must contain observed evidence only. Do not mark a pending item as passed and do not store a review code, Cookie, token, database URL, digest, or health answers here.

| Field | Evidence |
|---|---|
| Commit SHA | Pending final P0-12 merge |
| Production URL | Pending external deployment |
| Preview acceptance run | Pending external deployment |
| Production acceptance run | Pending external deployment |
| CI run | Pending P0-12 PR |
| Test counts/results | Pending P0-12 PR CI |
| Paid Session smoke | Pending external deployment; record pass/fail only |
| Smoke operator/time (UTC) | Pending external deployment |
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
