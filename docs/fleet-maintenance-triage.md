# Fleet maintenance triage

## Data and history model

`fleet_maintenance_items` stores one durable work item per top-level Slack report or manual creation. It keeps tenant/business/vehicle scope, source, reporter snapshot, status, scheduling and cost fields, related damage links, and these independent triage dimensions:

- `severity`: critical, high, moderate, low, or unknown
- `operational_impact`: out of service, restricted use, operational with caution, operational, or unknown
- `time_sensitivity`: immediate, same day, within 48 hours, this week, routine, or unknown
- `resolution_effort`: quick fix, on-site service, parts required, appointment required, repair shop required, diagnostic required, or unknown
- `scheduling_dependency`: no appointment, internal staff, mobile service, shop appointment, vendor availability, parts availability, or unknown
- `effective_priority`: urgent, high, normal, or low

`fleet_maintenance_history` is append-only business history for reports, notes, Slack edits/deletions, status transitions, triage overrides, and attachments. A Slack deletion marks the source unavailable but does not delete the work item or prior text. Completed and cancelled items remain queryable service history.

Attachments are metadata rows in `fleet_maintenance_attachments`; file bytes stay in the existing private S3 bucket. `fleet_maintenance_slack_events` provides a unique Slack event ledger.

## Triage and ordering

Rules in `lib/maintenance/triage.ts` are deterministic and conservative. Brake failures, oil-pressure warnings, overheating, leaks, smoke, and flats rise to immediate/urgent review. Low tire pressure remains high priority while retaining `quick_fix`. Washer fluid is a visible low-priority quick fix. Oil changes and planned services retain appointment dependencies without being mislabeled urgent.

Unknown or ambiguous text is placed in `needs_review`. Priority sorting uses safety/out-of-service status first, then time sensitivity, effective priority, overdue state, severity, quick-fix efficiency, report time, and recent activity. A quick fix is never assumed to be low severity, and an appointment is never assumed to be urgent.

Owner/admin overrides require a reason, append previous and new values to history, and clear the automated-review flag. Slack text such as “fixed” is recorded as a possible-completion note; only an authorized CRM action can complete work.

## Fleet integration

The Fleet Maintenance workspace provides metrics, full-text search, status/priority/category/vehicle filters, priority sorting, a responsive detail drawer, manual creation, actions, private attachment links, and history. Van profiles include active and completed maintenance. Fleet cards include compact active/quick-fix summaries.

The Fleet “Needs Attention” set is the unique union of vans with existing severe damage and vans with urgent, out-of-service, or overdue-high maintenance. A van with both appears once and shows both reasons.

## Isolation and security

All rows carry tenant and business identifiers with equality constraints. Validation triggers verify vehicle, assignee, inspection, case, item, history, and attachment scope. RLS permits tenant reads and reserves mutations for the service role after server-side authentication and authorization. API paths re-check tenant/business scope. S3 objects are encrypted, private, served with short-lived signed URLs, and never stored as permanent signed URLs.

## Known limitations and rollback

- Rule-based triage is intentionally narrow; unmatched language needs human review.
- Vehicle matching requires one exact tenant-scoped van number. Missing or ambiguous matches remain unresolved.
- The workspace currently refreshes after mutations; realtime tables are published for later live subscriptions.

Rollback requires disabling the maintenance channel first, stopping application writes, removing publication entries/policies/functions/triggers, and then dropping maintenance tables in child-to-parent order. Preserve a database and S3 inventory snapshot because history and attachments are business records.
