# Level 3 first-detected attribution

## Source of truth

`van_damage_cases` is the durable source of truth. Phase 3H adds the original observation, inspection, upload session, evidence image, reporter snapshot, source timestamp, timestamp kind, resolution time, and latest-uploader snapshot. `refresh_van_damage_case_attribution(case_id)` resolves these fields from the case's earliest valid observation.

The chronological source timestamp is chosen in this order:

1. Slack file creation time
2. Slack message time
3. Upload-session start time
4. Inspection submission time
5. Inspection creation time
6. Observation time or database creation time

Ordering is by the selected source timestamp, observation time, and observation UUID. Dismissed inspections, invalidated or dismissed observations, and items marked as false positives are excluded. The resolver is run by a deferred observation trigger and once as a migration backfill.

## Reporter semantics

The first reporter is the Slack user snapshot on the original upload session, falling back to the inspection and then observation snapshot. Later observations update `latest_uploader_snapshot`; they do not replace the first reporter. Legacy cases without valid attribution display the existing detection time and an unavailable reporter rather than inventing identity.

> Reporter information identifies who submitted the inspection images and does not determine who caused the damage.

Repeated observations remain attached to the durable case and increment its history without changing the original attribution. Repair does not erase the case or its evidence. A recurrence is a distinct case and receives its own original attribution. Case merges cause the survivor's observations to be reevaluated, so the earliest valid source among the merged evidence wins deterministically.

## Surfaces

The Fleet severe-damage card, inspection finding, and van damage-case card show original reporter and source time. Original inspection, upload-session, and evidence identifiers are linked or displayed when available. Latest uploader is labeled separately.

## Migration and rollback

Migration `20260723090000_level3_attribution_fleet_maintenance.sql` is additive. A rollback should first stop new application code, remove the deferred trigger and resolver, and then drop the added case columns only after confirming no reporting or audit consumer depends on them. Dropping attribution columns loses the durable backfill, so a database snapshot is required before rollback.

## Known limitations

- Historical reporter identity can only be as complete as the stored upload/inspection snapshots.
- An observation with no trustworthy source time uses the inspection/database fallback and exposes the timestamp kind.
- The UI treats the existing high/critical severity vocabulary as Level 3-equivalent; normalization remains owned by the existing damage workflow.
