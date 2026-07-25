# Global Command Center

## Behavior

The Command Center opens from the top bar or with Command/Ctrl+K. Keyboard opening is immediate,
focus moves to the query, arrow keys change the active result, Enter executes, Escape closes, and Tab
stays inside the dialog. Recent commands are session-only and limited to safe application paths.

Static navigation comes from the same active module list used by the shell. Contextual actions are
added only for roles and modules that can use them. Platform owners receive owner commands but do not
run tenant-record search without a tenant user context.

## Search architecture

`GET /api/command-center/search` creates an authenticated Command Center context and delegates to
`lib/command-center/search.ts`.

- Every record query includes the authenticated tenant ID.
- Record families are enabled only by active modules.
- Customer search also requires customer-view permission.
- Staff Action Required results respect assignment visibility.
- Queries are normalized, case-insensitive, escaped, capped, debounced, and abortable.
- Responses are `private, no-store`.

Supported record families are vehicles, inspections, maintenance, customers, appointments, orders,
and Action Required items. Results contain safe labels, status context, record type, record ID, and
internal application paths. They contain no raw AI output, infrastructure status, provider, model,
secret, or private media URL.

## Failure behavior

Static commands remain available if remote record search fails. The dialog shows a scoped error and
does not substitute mock results. Empty search shows recent and authorized static commands.

## Permissions and testing

The API uses `requireCommandCenterContext('view_dashboard')`; database RLS remains the final
authorization layer. Automated tests cover active-module navigation, role-specific commands,
case-insensitive search, tenant filters, permission gates, provider-neutral payloads, and private
cache headers.
