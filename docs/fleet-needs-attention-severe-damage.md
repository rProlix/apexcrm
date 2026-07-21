# Fleet Needs Attention for Severe Van Damage

Phase 3E connects Van Damage AI to the existing Fleet route at `/dashboard/vehicles`. Needs Attention is a damage overlay; it does not overwrite a van's operational `vehicles.status` or imply that an acknowledged van is safe to operate.

## Severity and qualification

`lib/van-damage/severity.ts` and `public.van_damage_severity_level(text)` provide the shared application and database mapping:

- Level 0: no damage
- Level 1: low, minor, dirt, or debris
- Level 2: medium, moderate, or light scratches
- Level 3: `3`, `level_3`, `level 3`, `level3`, high, severe, or `dents_or_damage`
- Level 4 and higher: critical, extreme, or an explicit numeric level above 3

Unknown values do not qualify. A recognized human-reviewed `effective_severity` overrides current AI severity in either direction. Otherwise current case severity is used, followed by maximum observed severity.

A van qualifies while it has at least one Level 3-or-higher source in an active lifecycle: active, needs review, confirmed, repair scheduled, in repair, awaiting verification, or recurrent. Repaired, resolved, dismissed, and archived cases do not qualify. Legacy severe findings without a Phase 3D case remain eligible without being guessed or merged into new cases.

## Unique van aggregation and alerts

`get_fleet_needs_attention(tenant_id, business_id)` returns one row per active alert and therefore one row per tenant and van. The Fleet client repeats the tenant-plus-van uniqueness check defensively before rendering. Counts represent unique vans, not images, findings, inspections, cases, alerts, or observations.

`van_damage_attention_alerts` stores durable attention history. A partial unique index on `(tenant_id, van_id, attention_type)` where status is active guarantees at most one active severe-damage alert per van, including under concurrent workers. Historical resolved or dismissed alerts remain available, so recurrence after repair can create a new active alert without reopening history invisibly.

The deferred damage-case trigger calls `refresh_van_severe_attention` at transaction completion. That function uses an advisory transaction lock, recomputes all active severe sources, and atomically creates, updates, or resolves the attention alert. Repeated observations update latest inspection/evidence, last-observed time, observation count, and suppressed-duplicate count while preserving the first-triggered time and single alert count.

## Fleet query and card

The tenant-scoped aggregate returns the vehicle, operational status, profile-image reference, latest evidence, highest severity, severe-source and total-case counts, first/last timestamps, latest inspection, latest uploader snapshot, upload time/image count, review count, repair state, recurrence state, acknowledgement, and duplicate-suppression count in one query. It avoids per-card database queries.

Cards prefer the manually selected or automatic vehicle profile image, then latest severe evidence, then the standard placeholder. Images continue through the authorized signed-image endpoint; no signed URL is persisted. The uploader is described only as the person who submitted the images, not as responsible for the damage.

Supported owner/admin actions are acknowledgement, repair scheduling, start repair, mark all active severe cases repaired, and case-level effective-severity review with a required reason. Acknowledgement leaves the alert active. Repair scheduled and in repair remain in Needs Attention. The van leaves only after no qualifying severe source remains.

Inspection approval, rejection, manual review, repair, and archive actions now synchronize linked damage-case lifecycle. A human downgrade removes a van only when it was the final qualifying severe case; another active severe case keeps the van in the column. A later recurrent case creates a new attention period after the prior alert was resolved.

## Realtime, security, and rollout

The existing Supabase browser client subscribes once to tenant-filtered changes on `van_damage_attention_alerts`, debounces refreshes, and removes the channel on unmount. Server rendering remains the source of truth, with loading, error, empty, filtering, sorting, responsive, and keyboard-focus states.

All queries and mutations require an authenticated tenant/business scope. Management mutations require owner or admin access and execute service-role-only RPCs after application authorization. The aggregate RPC also checks the authenticated database role and membership. New alert rows use tenant-scoped RLS; `business_id` must equal `tenant_id`.

Apply `20260721180000_fleet_severe_damage_attention.sql` before deploying the application. The migration is additive, backfills one alert per qualifying van, preserves historical data, and does not change S3, Slack, SQS, Gemini, or vehicle operational status. Rollback may leave the additive alert history unused; dropping it is not required for application rollback. Existing resolved alerts should not be manually merged without trusted business review.

## Current limitations

- No general notification-delivery table exists for Van Damage AI, so creation, escalation, repeated observation, acknowledgement, and resolution are recorded in `activity_logs` rather than sent through a new notification channel.
- Legacy severe findings can qualify but do not expose bulk repair actions until they are associated with durable damage cases.
- The Fleet module had no drag-and-drop behavior, so Phase 3E does not introduce a second operational-status mutation model.
