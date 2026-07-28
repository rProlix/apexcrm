# Inspection analysis recovery

The recovery utility is intentionally dry-run by default and requires both tenant and date bounds:

```bash
npx tsx scripts/repair-multi-image-inspections.ts \
  --tenant TENANT_UUID --from 2026-07-01T00:00:00Z --to 2026-07-31T23:59:59Z
```

Review the inspection IDs and missing-image counts. To queue only missing/failed image analyses:

```bash
npx tsx scripts/repair-multi-image-inspections.ts \
  --tenant TENANT_UUID --from 2026-07-01T00:00:00Z --to 2026-07-31T23:59:59Z --execute
```

The command preserves completed image analyses and historical findings, creates image-scoped jobs
with stable idempotency, recalculates each aggregate, and records an audit event. It will not scan
another tenant, operate without a date range, or reprocess every historical image automatically.
Inspections without a usable historical job template are reported and skipped.

Before execution, apply the multi-image migration, verify the worker schema health contract, and
confirm SQS/Supabase service configuration. Afterward, check the queue/DLQ, partial-failure actions,
image states, aggregate confidence, damage-map findings, and source-image overlays.

Rollback should stop new ingestion and roll back the web/worker release first. Do not drop the new
analysis table or columns: they contain evidence and are backward-compatible. Reverting the
migration itself requires a separately reviewed data-preserving migration.
