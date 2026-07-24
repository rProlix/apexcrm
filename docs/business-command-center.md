# Business Command Center

## Architecture

The business command center is a server-rendered, tenant-scoped operational
layer over the existing CRM modules. It does not replace module records or
create a second tenant model.

The authenticated `public.users.tenant_id` is the tenancy source of truth.
`requireCommandCenterContext()` validates the session, active user row,
permission, tenant configuration, active modules, business type, and tenant
timezone before returning a service-role database client. Every service-role
query also includes an explicit `tenant_id` predicate.

The existing dashboard active-module resolver remains authoritative. Command
center features use its accessible module keys, so disabled modules are not
queried and their historical data is not returned to normal operational views.

## Action Required

`command_action_items` stores human-actionable work only. Source loaders derive
items from real inspections, damage analysis, maintenance, Slack configuration,
payments, appointments, store orders/inventory, leads, rewards, and website
configuration. A failed source query preserves existing items and reports a
warning; it never treats a failed query as an empty source.

The lifecycle is `open`, `in_progress`, `snoozed`, `resolved`, or `dismissed`.
Source synchronization creates new items, refreshes open items, reopens expired
snoozes, and automatically resolves items whose source condition is fixed.
Resolved rows reopen if the same authoritative source issue recurs; dismissed
rows remain historical records. Urgent/high dismissals require an administrator
and a reason.

Staff see unassigned staff-operational work and work assigned to them. Admins
see tenant work. Inactive-module candidates are never loaded or synchronized.

To add a source, add one tenant-predicated loader in
`lib/command-center/actions.ts`, return its tracked action types only when the
source query succeeds, and map it to a controlled source route.

## Smart Setup

The setup resolver evaluates completion from real records and configuration.
Browser storage is not authoritative. Steps are built from active modules,
filtered by role permissions, synchronized into `command_setup_steps`, and
grouped by module.

Required steps cannot be dismissed. Optional steps may be dismissed by tenant
administrators. Completion timestamps are written when the underlying condition
first becomes true. Staff do not receive admin-only configuration steps.

Add a module by declaring its real completion predicates and permission-safe
routes in `lib/command-center/setup.ts`.

## Staff Activity

The activity feed projects existing `audit_logs` and `activity_logs` into
business-readable events. It does not duplicate the authoritative audit trail.
The presentation layer maps known technical events, removes raw metadata, and
filters owner/admin visibility before returning data.

The default feed includes active modules only. Dates and date groups use the
tenant timezone. Infrastructure diagnostics, provider payloads, credentials,
and Inspection Metadata events are never shown to tenant users.

## Reports

`REPORT_REGISTRY` declares each report’s module, permission, formats, date
support, loader, filename, summary, columns, and empty state. Loaders query real
tenant data only. Available reports are the intersection of the registry,
active modules, and the current user’s `view_reports` permission.

PDFs are generated server-side as valid PDF files; CSV files include a UTF-8
BOM and escaped cells. Both formats include tenant/report identity and
date-range context. `command_report_runs` records safe generation metadata, and
downloads produce audit events. No report includes raw AI output, model IDs,
Slack tokens, storage keys, infrastructure configuration, or Inspection
Metadata.

## Role-Based Dashboard

The tenant dashboard combines:

- What Changed Today
- Action Required
- Setup health
- Recent staff activity
- Active-module AI assistants
- Existing active-module widgets

Admins receive operational and reporting links their permissions allow. Staff
receive permitted work and do not receive setup/settings/report links they
cannot use. The platform owner dashboard remains the separate global overview;
tenant command-center links are not added to it. Customer portal routes remain
customer-safe and do not receive internal command-center widgets.

Existing widget loaders still distinguish an active empty state from a query
error. No failure is rendered as a fake zero.

## Universal Notes and Attachments

`universal_notes` and `universal_note_attachments` support a controlled entity
registry only: customer, vehicle, inspection, damage case, maintenance item,
appointment, order, payment, and website lead. Client-supplied table names are
never accepted. Before every read or write, the resolver checks the entity
type, active module, tenant ownership, and user permission.

Notes default to internal. Customer-visible notes require an administrator and
are not exposed to the current customer portal until a customer-safe record
ownership resolver is added. This is intentionally safer than making all
customer-visible notes readable across a tenant.

Attachments use the private `document-assets` bucket, tenant-prefixed paths,
the existing MIME/size registry, and five-minute signed download URLs. Only the
storage reference is stored. Signed URLs are never persisted. The current
infrastructure has no virus scanner, so the upload route is the documented hook
for adding one before broader file types are enabled.

## Notification Rules

`notification_rules` stores active-module event rules. `notifications` stores
resolved per-user deliveries and read state. Supported recipient modes are
specific user, role, assigned user, and record owner.

In-app delivery is always available. Email appears only when the existing email
provider validates successfully. SMS and outbound Slack controls are not shown
as enabled because those delivery backends are not implemented. Errors are
stored as sanitized error codes.

New action candidates emit matching notification events once. Rules, conditions,
quiet hours, tenant timezone, active modules, recipient membership, and channel
capability are checked before delivery.

## Module AI Assistants

The assistant uses a provider-neutral adapter path and controlled per-module
question registry. It sends only daily summary facts and relevant open-risk
labels for the selected active module. It does not send tokens, webhook
payloads, owner metadata, full audit records, raw provider output, or records
from inactive modules.

The UI uses provider-neutral labels and failure text. Suggestions are explicitly
non-authoritative and cannot mutate records.

## What Changed Today

The daily summary converts the tenant’s local midnight boundaries to UTC,
including daylight-saving transitions. Each active module loader returns only
meaningful non-zero facts. High-priority action items are listed first with
controlled source links.

An empty successful day says “Nothing urgent changed today.” A query failure
returns “We couldn’t load today’s summary” and never converts failure to zero.

## RLS and Permissions

Migration `20260724120000_command_center.sql` adds membership/admin helper
functions, tenant indexes, validation checks, updated-at triggers, RLS, grants,
and service-role policies for all new tables. Direct browser reads remain
tenant/member and active-module scoped. Polymorphic notes and attachments also
validate the referenced entity’s tenant ownership in RLS. Direct writes are
further restricted by author, recipient, or tenant-admin identity.

Application authorization remains mandatory because service-role calls bypass
RLS. Platform infrastructure and Inspection Metadata authorization were not
changed.

## Known Limitations

- Scheduled report or daily-summary delivery is not enabled because there is no
  reliable recurring job contract for this feature.
- SMS and outbound Slack delivery are intentionally unavailable.
- Customer-visible universal notes are stored but are not yet exposed in the
  customer portal.
- Existing maintenance Slack history remains authoritative for Slack thread
  mutations; universal notes complement it instead of rewriting that history.
- The current private upload path has a virus-scan hook but no configured
  scanner.

## Rollback

The migration is additive. A code rollback can stop using the command-center
routes while preserving action history, notes, rules, notifications, and report
audit metadata. Do not drop the tables during an application rollback unless
their records have been exported and retention requirements reviewed.

To disable a module, use the existing tenant module flag. The command center
will stop querying and displaying that module without deleting historical data.
