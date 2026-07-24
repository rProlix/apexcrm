# Dashboard Active Modules

The tenant dashboard is driven by `getActiveDashboardModulesForTenantUser` in
`lib/dashboard/activeModules.ts`.

## Source of Truth

`tenant_id` is the tenant boundary. Enabled modules come from
`loadTenantConfig(tenantId)`, which reads `tenant_modules` for that tenant. The
dashboard does not trust browser-supplied module state.

`business_id` remains a compatibility alias where older tables still carry it,
but dashboard queries must filter by `tenant_id`.

## Filtering Order

Dashboard rendering follows this order:

1. Resolve the authenticated user and role.
2. Resolve the current tenant.
3. Load the tenant module configuration.
4. Resolve active dashboard widgets from the registry.
5. Filter saved layout widgets to active, authorized widget keys.
6. Fetch data only for the filtered widget keys.
7. Pass only active registry metadata and suggestions to the client.

Inactive module widgets are removed before data loaders run. They do not render,
reserve space, show setup prompts, or contribute suggestions.

## Permissions

Each widget declares an optional `requiredPermission`. If none is provided, the
resolver requires `view_dashboard`. Report and financial widgets use
`view_reports`; operational module widgets generally use `use_modules`; customer
widgets use `view_customers`.

Customers do not receive the internal tenant dashboard because customer roles do
not have `view_dashboard`.

## Widget Registry

`lib/dashboard/widgetRegistry.ts` is the dashboard widget registry. A widget
declares:

- `key`
- `label`
- `type`
- `description`
- `moduleKey`
- `requiredPermission`
- `defaultSection`
- `emptyMessage`
- `tenantFacing`
- `ownerOnly`
- `priority`
- `fetcher`

Use `priority` for deterministic ordering. Critical operational widgets should
have lower priority numbers than routine summaries.

## Empty and Error States

Inactive module:

The widget is not rendered and its loader is not called.

Active module with no records:

The widget renders its `emptyMessage`, such as "No active maintenance items."

Query failure:

The server returns a widget error payload and logs a structured message with the
tenant id, widget key, module key, and sanitized error message. The UI does not
convert failed queries into zero counts.

## Tenant Timezone

Current dashboard date-based widgets use tenant-scoped queries and are ready for
tenant timezone normalization as tenant timezone metadata becomes standardized.
The important boundary is that inactive module date queries are never executed.

## Business Type

The dashboard adapts through active modules. Fleet, Van Damage AI, Maintenance,
Store, Appointments, Payments, Customers, Rewards, and Website widgets only
appear when their module is active and the user has permission.

## Realtime and Cache

The dashboard avoids subscribing to inactive modules by filtering at render and
save time. Future realtime invalidation should use the active widget keys from
the resolver so module-specific events refresh only the widgets they affect.

## Security

Layout saving re-resolves the authenticated user and tenant on the server. A
non-owner cannot save a layout for another tenant, and the saved layout is
filtered through the active resolver before persistence.

Owner-only diagnostics and infrastructure status must remain in owner areas, not
normal tenant dashboard widgets.

## Adding a Widget

1. Add the widget to `WIDGET_REGISTRY`.
2. Set `moduleKey` to the module that owns the data.
3. Set `requiredPermission` to the narrowest existing permission.
4. Use a tenant-scoped query.
5. Return a clear `emptyMessage` for zero data.
6. Add or update resolver tests when the widget introduces a new module,
   permission, or ordering rule.

## Rollback

Rollback is code-only for this phase. No schema migration is required. Reverting
the dashboard resolver changes restores the prior saved-layout behavior, but it
will also restore the risk of inactive saved widgets being fetched and rendered.
