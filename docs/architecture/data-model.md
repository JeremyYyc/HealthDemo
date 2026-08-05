# Data model

The database uses PostgreSQL enums, exact numeric columns, restrictive foreign keys, and explicit forward-only migrations. Prisma owns the portable model; reviewed SQL migrations add PostgreSQL partial unique indexes that Prisma cannot declare.

```mermaid
erDiagram
  SESSION ||--o{ ASSESSMENT : owns
  ASSESSMENT ||--o| ASSESSMENT_RESULT : produces
  SESSION ||--o| SUBSCRIPTION : has
  SESSION ||--o{ PAYMENT : makes
  ASSESSMENT ||--o{ PAYMENT : references
  PAYMENT o|--o| SUBSCRIPTION : activates

  SESSION {
    uuid id PK
    varchar token_hash UK
    timestamptz expires_at
  }
  ASSESSMENT {
    uuid id PK
    uuid session_id FK
    enum status
    int version
    decimal health_fields
  }
  ASSESSMENT_RESULT {
    uuid id PK
    uuid assessment_id FK_UK
    varchar algorithm_version
    jsonb prediction_curve
  }
  SUBSCRIPTION {
    uuid id PK
    uuid session_id FK_UK
    uuid activation_payment_id FK_UK
    enum status
  }
  PAYMENT {
    uuid id PK
    uuid session_id FK
    uuid assessment_id FK
    varchar idempotency_key
    varchar transaction_id UK
  }
```

Additional invariants:

- `assessments_one_in_progress_per_session` permits at most one in-progress assessment per session.
- `payments_one_succeeded_per_session` permits at most one first successful payment per session.
- `(session_id, idempotency_key)` is unique while the text key remains reusable by another session.

## Migration and rollback policy

Production uses `prisma migrate deploy`; `db push` and destructive resets are prohibited. Migrations are additive and forward-only. If the application must roll back, deploy the previous compatible application first and retain the migrated database. A database rollback requires a separately reviewed compensating migration; this initial migration has no destructive automatic down migration.

The migration history is deliberately split into a portable baseline schema and a following PostgreSQL-invariants migration. This allows CI to baseline an existing previous schema, insert a historical Result snapshot, apply a migration that actually changes the catalog, and prove the snapshot remains byte-for-byte equivalent at the SQL value level.
