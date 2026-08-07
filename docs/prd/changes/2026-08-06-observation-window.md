# Change note: delivery observation window

| Field | Decision |
|---|---|
| Date | 2026-08-06 |
| Reason | Delivery time constraint; retain an explicit post-release observation gate while shortening its duration |
| Approved change | Replace the 24-hour Production observation window with 12 hours; keep two checks in the first 30 minutes and the 2-hour checkpoint, and move the final checkpoint to 12 hours |
| User impact | No product, entitlement, health calculation, persistence, or API behavior changes |
| Affected documents | `README.md`, `08-deployment-and-delivery-spec.md`, `09-prd-review-record.md`, `10-mvp-freeze-manifest.md`, and the final acceptance record |
| Data/API compatibility | No schema, migration, API contract, or stored-data impact |
| Test impact | Automated quality gates and Preview/Production smoke remain unchanged; only the final monitoring deadline changes |
| Owner | Repository owner / release owner |
| Approval | Explicitly approved by the repository owner in the delivery task on 2026-08-06 |

The release remains incomplete until the 12-hour checkpoint and any later review completion have no unresolved S0/S1 issue.
