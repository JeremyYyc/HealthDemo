# Change note: README information architecture

| Field | Decision |
|---|---|
| Date | 2026-08-10 |
| Reason | The 570-line README mixed project orientation, API walkthrough, cloud deployment, operations, and acceptance evidence, making the repository entry point difficult to scan and maintain |
| Approved change | Keep concise summaries and navigation in README; move the executable API flow, Supabase/Vercel deployment procedure, and operations runbook into versioned documents under `docs/` |
| User impact | No product, entitlement, calculation, persistence, API, security, or deployment behavior changes |
| Affected documents | `README.md`, `docs/guides/api-walkthrough.md`, `docs/guides/deployment.md`, `docs/operations/runbook.md`, the Chinese delivery summary, and P0-12 documentation wording |
| Data/API compatibility | No schema, migration, API contract, or stored-data impact |
| Test impact | Commands and acceptance gates are unchanged; internal Markdown links and the normal repository quality gate must pass |
| Owner | Repository owner |
| Approval | Explicitly requested by the repository owner on 2026-08-10 |

The frozen delivery specification records what was required and accepted for the original MVP. This change adjusts only where that information is maintained after acceptance:

- `README.md` remains the canonical entry point and links every required topic.
- `docs/guides/api-walkthrough.md` is the canonical executable Cookie-Jar flow.
- `docs/guides/deployment.md` is the canonical Supabase/Vercel and release-order guide.
- `docs/operations/runbook.md` is the canonical monitoring, rollback, rotation, and retention guide.
- `docs/architecture/data-model.md` remains the canonical ER model.
- `docs/delivery/final-acceptance.md` remains the canonical observed release evidence.

This split removes duplication without weakening the original acceptance evidence or changing runtime behavior.
