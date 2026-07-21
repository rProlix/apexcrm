# Van Profile Driver and Damage History

Phase 3D adds a durable van-profile layer on top of the existing Slack to SQS to EC2 worker inspection flow.

## Repository architecture found

- Van profile entry point: `app/(dashboard)/dashboard/vehicles/page.tsx`
- Van profile route: `app/(dashboard)/dashboard/vehicles/[vehicleId]/page.tsx`
- Inspection route: `app/(dashboard)/dashboard/damage-ai/inspections/[inspectionId]/page.tsx`
- Slack events endpoint: `app/api/integrations/slack/events/route.ts`
- SQS contract: `lib/van-damage/contracts.ts`
- Worker entry point: `workers/van-damage-worker/src/process-job.ts`
- Worker persistence adapter: `workers/van-damage-worker/src/supabase-worker.ts`
- Signed image route: `app/api/van-damage/images/[imageId]/signed-url/route.ts`
- Tenant access helper: `lib/server/van-damage/access.ts`
- Page scope helper: `lib/server/van-damage/page-scope.ts`
- Existing Slack scopes include `users:read`, so reconnect is not required for installations made with the current scope list. Older installations without `users:read` still work with Slack user ID fallback.

## Driver attribution flow

The Slack message uploader is treated as the driver for that upload session. The events endpoint captures:

- workspace ID
- channel ID
- Slack user ID
- message timestamp and thread timestamp
- original message text
- image count
- upload-session source key
- a safe snapshot of Slack profile fields when `users:read` allows `users.info`

Profile lookup is server-side only, uses the encrypted bot token, and is nonblocking. If lookup fails, processing continues with the Slack user ID. Display fallback order is display name, real name, username, shortened Slack ID, then `Unknown driver`.

Each uploader also has one durable `van_slack_user_profiles` row per tenant and Slack workspace. Database triggers create or refresh that profile in the same transaction that creates the inspection and upload session. Both records store `driver_profile_id`, while their JSON snapshot preserves the uploader name as it appeared at upload time. `van_driver_daily_activity` provides the driver-to-van relationship grouped by UTC calendar day; individual upload sessions remain available for exact timestamps and same-day shift history.

The driver attribution migration backfills pre-Phase-3D Slack inspections, creates their upload sessions, links their existing images, and associates the detected van. This means existing Slack inspection history is not lost when the durable driver model is enabled.

## Upload-session boundaries

One Slack message equals one upload session, even when the message contains multiple images. The stable source key is:

`tenant_id:slack_team_id:slack_channel_id:slack_message_ts`

Same-day messages are not merged. Duplicate Slack deliveries reuse the existing event, inspection, job, and upload session.

## Image ordering and profile images

Images store `upload_order` and `original_file_index` from Slack file order. The first session image is selected by upload order, then original index, then creation time and ID.

The van profile image stores a durable image record ID in vehicle metadata, not a signed URL. The renderer requests temporary signed URLs through the existing authorized image route. Manual profile-image choices are preserved until an admin restores automatic selection or removes the manual selection.

## Damage-case model

`van_damage_cases` represents durable unresolved or historical damage on one van. `van_damage_observations` links each inspection finding to a case when safe.

Matching uses a conservative fingerprint:

`tenant_id + van_id + canonical_region + normalized_damage_type`

Severity, confidence, timestamps, inspection IDs, and image IDs are not identity fields. Unknown regions, unknown types, low confidence, or multiple active candidates become `possible_duplicate` instead of being silently merged.

## Duplicate alert suppression

When a finding confidently matches one active unresolved case, the system:

- links the observation to the existing case
- increments observation count
- updates last observed time and latest evidence image
- preserves first detected time
- increments duplicate suppression count
- marks the observation as `existing_damage_observed`

No extra ordinary new-damage alert is represented for that duplicate observation.

## Recurrence behavior

If a matching case is repaired or resolved, the new finding becomes `recurrent_damage`. A new case is created and linked to the previous case through `recurrence_of_case_id`.

## Tenant isolation and RLS

All new tables include `tenant_id`, `business_id`, and a check that business equals tenant. RLS is enabled. Service role has mutation access; authenticated users only receive tenant-scoped reads through existing tenant membership checks. Server mutations use `resolveVanDamageAccess` with admin/owner management checks.

## Backward compatibility

All new columns are nullable. Historical inspections without driver snapshots, upload sessions, order fields, or damage-case links render as unknown driver and legacy findings. Older queued SQS jobs still parse because Phase 3D SQS fields are optional.

## Rollout and rollback

Roll out the migration before deploying the web app and worker changes. The worker health schema contract is intentionally unchanged so existing workers continue to run during rollout. Rollback can leave the additive tables unused; no existing columns are renamed or deleted.

## Known limitations

- Slack profile enrichment depends on `users:read`; without it, driver display falls back to Slack user ID.
- The duplicate matcher is intentionally conservative and does not use image-comparison geometry beyond canonical region/type.
- There is no separate van-damage notification table in the current schema, so alert creation/suppression is represented on damage cases and observations.
- Manual merge/split duplicate review tools are not added because the current backend does not yet provide safe correction workflows for those operations.
