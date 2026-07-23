# Slack maintenance channel

## Setup

Phase 3H reuses the existing encrypted Slack workspace installation. In Van Damage AI Slack settings, select any number of inspection channels and, separately, at most one Fleet maintenance channel. Invite the bot before saving. A channel cannot have both purposes.

The existing Events API endpoint verifies the Slack signature before parsing. It then resolves the connected workspace and selected channel purpose:

- `damage_inspection`: requires supported images and continues through the existing inspection, queue, worker, and AI analysis flow.
- `maintenance`: accepts text and supported attachments, creates or updates maintenance history, and never creates an inspection or SQS job.
- unselected or unsupported: acknowledged and ignored.

Bot/hidden messages are ignored to prevent loops.

## Messages, threads, edits, and deletes

A top-level message creates one maintenance item even when it has several attachments. Van references use the shared parser and require an exact, unique, tenant-scoped `van_number`. Examples include `van #64`, `#64`, and contextual `64 has a coolant leak`. Measurements, dates, mileage, and prices are not treated as van numbers without van context.

A thread reply appends a note and its attachments to the original item. Completion words are advisory metadata and never auto-complete work. A message edit preserves the previous text in history and marks the item for review. Deleting a source message records a deletion event, preserves prior history, and marks a top-level source unavailable.

## Idempotency and concurrency

`fleet_maintenance_slack_events.slack_event_id` is unique. The ingestion RPC uses transaction advisory locks plus unique event and message-source indexes, so Slack retries and concurrent deliveries return the existing item. Attachment Slack file IDs are unique per tenant. A top-level message maps to one work item, not one item per file.

## Attachments

Supported images, PDFs, text/CSV, and short common video formats are limited to 25 MB each. The server downloads with the encrypted bot token, streams bytes into the tenant-scoped private S3 prefix, enables server-side encryption, and persists only bucket/key metadata. Raw audit payloads omit Slack private URLs and tokens. Download endpoints authenticate tenant access and issue 15-minute signed URLs that are cached only in process memory.

## Permissions and auditing

Channel configuration requires owner/admin access. Maintenance reads require authenticated tenant membership; owner/admin access is required for workflow and triage changes. Manual reports and notes retain their CRM actor. Slack reports retain reporter snapshots. Activity logs cover channel configuration, case attribution, maintenance creation, updates, and Slack mutations.

Reporter identity describes submission only:

> Reporter information identifies who submitted the maintenance report and does not determine who caused the issue.

## Operations

The migration must be applied before enabling a maintenance channel. Confirm the bot has channel membership and `users:read` if display-name snapshots are desired. If attachment ingestion fails, the item and history remain intact and the attachment row shows `failed` for retry/diagnosis. Disabling the maintenance channel stops new maintenance ingestion without affecting inspection channels or existing history.
