# Premium enterprise design system

The authenticated CRM uses one calm, dark enterprise system across platform-owner, tenant-admin,
manager, staff, fleet, maintenance, inspection, reporting, notes, notifications, and module-package
workflows.

## Principles

- Prioritize decisions and operational risk before secondary metrics.
- Use flat layered surfaces, restrained shadows, and clear borders. Gradients and glass effects are
  not part of the core system.
- Keep status meaning redundant: every semantic color is paired with readable text and, where
  useful, an icon.
- Keep body copy at a readable contrast. Muted text is reserved for metadata, not instructions or
  decisions.
- Use the tenant accent for identity and primary actions only. Error, warning, success, and
  processing colors remain semantic.
- Preserve keyboard focus, minimum touch targets, reduced-motion preferences, and usable mobile
  reflow.

## Tokens

Tokens live in `app/globals.css` and `tailwind.config.ts`.

- Surfaces: canvas, base, raised, overlay, subtle/default/strong borders.
- Type: primary, secondary, and tertiary text tiers.
- Shape: control, panel, card, and overlay radii.
- Depth: surface and overlay shadows.
- Motion: fast, base, and slow transitions with a global reduced-motion override.
- Brand: `--tenant-accent`, `--tenant-accent-rgb`, and
  `--tenant-accent-foreground`.

`resolveSafeTenantAccent` validates white-label colors server-side. Malformed colors and colors that
would disappear into the dark canvas or conflict with white content fall back to the default gold.
The authenticated layout supplies the resulting CSS variables to the whole workspace.

## Shared patterns

- `PageHeader`: consistent page title, description, metadata, icon, and actions.
- `Card`: standard panel hierarchy.
- `Button` plus `ui-button-*`: primary, secondary, ghost, and destructive actions.
- `StatusBadge`: semantic status mapping with text and icon support.
- `StatePanel`: shared empty and recoverable-error states.
- `Skeleton`: page and content loading structure.
- `ui-input`, `ui-label`, and `ui-help`: labels, controls, and guidance.
- `ui-toolbar` and `ui-table`: filter/action rows and dense operational data.

Use shared patterns before adding a page-specific treatment. New semantic statuses should be added
to `StatusBadge` rather than styled independently.

## White-label and security boundaries

Tenant branding changes identity accents; it does not change authorization, module availability,
tenant scoping, RLS, or semantic safety colors. Logo media remains tenant-configured. Private
inspection and maintenance media continues to use authenticated short-lived access. UI copy does not
display provider model identifiers, raw database errors, credentials, or infrastructure secrets.

## Responsive behavior

The left navigation becomes a mobile drawer and the most important destinations remain available in
the bottom navigation. Toolbars stack, tables retain horizontal scrolling where a card reflow would
hide essential comparisons, and drawers use full width on narrow screens. Sticky controls sit below
the authenticated top bar.

## Extension checklist

1. Use the existing tokens and shared primitives.
2. Keep module, role, and permission gates on the server.
3. Include loading, empty, failure, and disabled states.
4. Verify keyboard focus, accessible names, contrast, mobile reflow, and reduced motion.
5. Add tests for policy or token logic and run format, tests, type-check, lint, and production build.
