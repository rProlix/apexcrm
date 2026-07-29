# Retention and legal hold

Retention metadata is tracked in Supabase, not inferred from object age alone.

Core tables:

- `retention_policies`
- `legal_holds`
- `storage_lifecycle_events`
- `archive_restore_requests`
- `deletion_jobs`

Legal hold blocks deletion by setting lifecycle state to `delete_blocked`. Destructive deletion is intentionally not automatic in the worker path; deletion jobs are represented in the database so owner-only workflows can approve and audit them before object removal is introduced.
