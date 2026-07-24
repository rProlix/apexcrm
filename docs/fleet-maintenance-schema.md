# Fleet Maintenance schema

## Production incident and authoritative schema

The Fleet Maintenance page queries `public.fleet_maintenance_items`. The missing-table
incident occurred because migration
`20260723090000_level3_attribution_fleet_maintenance.sql` existed in the application
repository but had not been applied to the linked hosted Supabase database. The
migration was applied to the intended project and PostgREST was instructed to reload
its schema cache. A direct authenticated service query then confirmed the table was
resolvable.

The authoritative maintenance tables are:

- `fleet_maintenance_items`
- `fleet_maintenance_history`
- `fleet_maintenance_attachments`
- `fleet_maintenance_slack_events`

The follow-up migration `20260723130000_fleet_maintenance_query_hardening.sql` adds
bounded-list and relationship lookup indexes without rewriting records.

## Isolation and history

All tables use `tenant_id` as the source of truth and retain `business_id` only as an
equal compatibility alias. Database triggers reject cross-tenant vans, inspections,
damage cases, assignees, history, and attachments. RLS is enabled immediately.
Browser access is read-only for active tenant members; mutations go through
authenticated server routes which always add explicit tenant and business predicates.

Slack reports are idempotent by tenant, workspace, channel, and message timestamp.
Thread activity is appended to `fleet_maintenance_history`; historical notes and
before/after values are not overwritten.

## Deployment and rollback

Migration history must be compared against the linked hosted project before app
deployment. Generate types with the repository Supabase workflow after structural
schema changes and verify `lib/supabase/types.ts`. PostgREST can be refreshed with
`NOTIFY pgrst, 'reload schema'`.

The schema migration is additive. The query-hardening migration can be rolled back by
dropping only its named indexes. Do not drop the authoritative tables because they
contain operational history.
