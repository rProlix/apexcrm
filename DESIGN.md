# ApexCRM Design System

## Direction

ApexCRM is an Operate surface with a quiet-luxury command-center language. The interface uses graphite surfaces, one tenant-safe accent, crisp typography, disciplined spacing, and short state-driven motion. Design variance is 4/5, motion intensity is 3/5, and visual density is 3/5.

The product extends its incumbent dark operational identity. It does not imitate a marketing site and does not replace familiar product affordances for novelty.

## Visual Principles

1. State before decoration. Color, depth, and motion explain priority, selection, hierarchy, or change.
2. One leading task per region. Secondary detail recedes through tone and proximity.
3. Familiar controls earn trust. Product character lives in precision, continuity, and operational language.
4. Tenant expression is bounded. Tenant accent and logo personalize the workspace without changing semantic safety states.
5. Motion is finite. Nothing blinks or loops simply to make the interface feel active.

## Typography

The existing licensed Inter variable face loaded with `next/font` remains the single interface family. System fallbacks preserve reliable rendering. A system mono stack is reserved for identifiers and technical measurements.

| Role              | Source class or token  | Intended use                               |
| ----------------- | ---------------------- | ------------------------------------------ |
| Page title        | `.ui-page-title`       | Route-level title, 24-28px, semibold       |
| Page subtitle     | `.ui-page-subtitle`    | Supporting explanation, 14px, maximum 65ch |
| Section title     | `.ui-section-title`    | Section or panel title, 16px, semibold     |
| Widget title      | `.ui-card-title`       | Repeated widget and compact panel title    |
| Metric value      | `.ui-metric-value`     | Tabular operational values                 |
| Metric label      | `.ui-metric-label`     | Short metric context                       |
| Body              | `.ui-body`             | Default reading text, 16px                 |
| Secondary         | `.ui-secondary`        | Supporting operational copy                |
| Table header      | `.ui-table thead`      | Stable compact label                       |
| Table body        | `.ui-table td`         | Scannable record data                      |
| Form label        | `.ui-label`            | Persistent label above a control           |
| Help and metadata | `.ui-help`, `.ui-meta` | 12px minimum contextual copy               |
| Error             | `.ui-error`            | Specific problem and recovery              |
| Dialog title      | `.ui-dialog-title`     | Overlay task title                         |
| Button label      | shared button classes  | 14px, medium or semibold                   |

Operational numbers use tabular figures. Uppercase is limited to true codes. Product copy uses sentence case. Body content remains within 65-75 characters where it is prose.

## Layout Grid

- App shell: 16rem desktop navigation with a persistent 5rem compact-rail option, fixed 4rem topbar, fluid content column.
- Main content: `max-w-screen-2xl` with responsive page padding.
- Page padding: `--space-page-x` and `--space-page-y`.
- Dense toolbars collapse vertically below their usable content width.
- Detail views may use a content column plus a contextual action rail when the rail does not cover or compress evidence.
- Mobile uses one column, a modal navigation drawer, bottom navigation, full-height record sheets, and reachable actions.

## Spacing

The system uses a 4px base rhythm. Controls use 8-12px internal gaps, related content uses 12-16px spacing, panel content uses 16-24px, and major page regions use 24-36px. Heading spacing is tighter below than above. One-off spacing values require a content or optical reason.

## Surface Hierarchy

1. Canvas: graphite base behind the application.
2. Base: navigation and broad structural regions.
3. Raised: panels containing a complete task or record group.
4. Overlay: popovers, drawers, dialogs, and command surfaces.

Cards are used only when they establish a task or state boundary. Related rows prefer proximity and one divider system. Nested cards are avoided.

## Corner Radius

- Controls: `--radius-control` (10px)
- Muted group and toolbar: 12px
- Panels and record cards: `--radius-panel` to `--radius-card` (14-16px)
- Overlays: `--radius-overlay` (18px)
- Pills are reserved for compact semantic status or segmented choices

## Shadows

- `--shadow-surface` provides restrained separation for raised work regions.
- `--shadow-overlay` provides stronger offset depth for temporary overlays.
- Tenant-colored halos and decorative glow are not part of the product system.
- Borders carry most hierarchy; shadows do not compensate for weak grouping.

## Color Rules

- Graphite neutrals define canvas and surfaces.
- `--tenant-accent` is used for primary actions, selected navigation, focus, and a small number of highlights.
- The server-resolved tenant accent must pass the product contrast constraints before reaching CSS variables.
- Red, amber, green, and blue remain reserved for semantic danger, warning, success, and information.
- Critical state meaning never relies on color alone.
- Provider branding and model identifiers do not appear in customer-facing analysis.

## Motion Tokens

| Token      | Duration | Use                                                            |
| ---------- | -------- | -------------------------------------------------------------- |
| `instant`  | 0ms      | Keyboard-open command palette and reduced-motion state changes |
| `feedback` | 120ms    | Press, active indicator, compact feedback                      |
| `state`    | 180ms    | Selection, filter, disclosure, content replacement             |
| `overlay`  | 240ms    | Popover, drawer, sheet, and dialog                             |
| `layout`   | 280ms    | Confirmed list reorder or shared layout continuity             |

Primary easing is `cubic-bezier(0.16, 1, 0.3, 1)`. Exit easing is `cubic-bezier(0.4, 0, 1, 1)` and exits are shorter than entrances. Spring motion is limited to direct manipulation or a signature shared-element transition and must be critically damped.

Animations use transform and opacity by default. Bounded shadow, clip, or backdrop changes are permitted only on isolated overlays. Routine UI motion stays below 300ms.

## Interaction Patterns

- Buttons acknowledge press with a subtle 0.98 scale or one-pixel translation and remain interruptible.
- Hover enhancements are gated to hover-capable pointers.
- Overlays remember the originating control, position or transform origin from it where practical, focus the first useful control, close with Escape, and restore focus.
- Command Center opens immediately from Command-K or Control-K. Pointer activation may use the overlay transition.
- Desktop navigation can collapse without hiding routes or counts; the server reads the preference before render to avoid layout flicker.
- Quick Peek preserves page scroll, fetches detail on demand, and becomes a full-height sheet on mobile.
- Selected records, findings, filters, and tabs receive a stable active indicator rather than repeated entrance animation.
- Destructive or safety-sensitive state is not removed before server confirmation.

## Navigation

Navigation renders only active, role-permitted modules. Desktop sidebar state is stable and can be compacted to an icon rail with accessible names. Mobile navigation uses an overlay drawer, background scroll lock, Escape dismissal, focus restoration, and an explicit backdrop. Current location is visible and announced. Route changes do not play orchestrated page entrances.

## Tables and Lists

- Sticky headers are allowed when they preserve column context.
- Rows remain stable during server work.
- Confirmed additions, removals, and reorders may use the layout token.
- Loading uses skeleton rows matching final dimensions.
- Empty and error states occupy the same content region as data.
- Mobile converts only the necessary columns into labeled record summaries.
- Primary actions remain available without hover.

## Forms

Labels remain above inputs. Shared `TextField`, `TextareaField`, and `SelectField` primitives connect labels, help text, and errors with the control. Focus, loading, disabled, error, and success states are explicit. Validation never shakes a whole form. Upload progress is shown only when it is measurable. Existing media remains visible until replacement succeeds.

## Loading, Empty, Error, and Success

- Loading skeletons approximate the final content and do not imply false progress.
- Empty states explain why the region is empty and provide the next permitted action.
- Errors identify the problem and a recovery path without exposing provider or infrastructure detail.
- Routine success is concise and does not block navigation.
- Significant completed work may receive one small, finite product-specific confirmation.

## Reduced Motion

Reduced motion preserves state communication while removing translation, scale, layout choreography, smooth scrolling, and nonessential animation. It does not use a global timing kill that erases useful feedback. State changes remain immediate, focus remains predictable, and no content depends on an animation completing.

## Performance Budgets

- No duplicate animation library.
- No scroll-position React state loops.
- No permanent `will-change`.
- Global command queries are debounced, capped, active-module-aware, and server-authorized.
- Quick Peek loads only the selected record.
- Realtime uses one tenant-scoped shared subscription layer, batches bursts, and renders safe summaries.
- Expensive media loads on demand.
- Added signature interactions must not create hydration warnings or block the main thread.

## Layer Scale

- Base: 0
- Sticky shell: 20
- Drawer and backdrop: 40
- Popover: 50
- Modal and command center: 60
- Toast or critical transient status: 70

## Anti-Patterns

- Decorative infinite pulses, ambient floating, scroll hijacking, gimmicky cursors, and page-load choreography
- Generic equal-card dashboard grids used without informational equivalence
- Glass, gradients, glow, and shadows without a hierarchy purpose
- Giant marketing headings or tiny operational metadata
- Rainbow status badges or tenant accent replacing safety colors
- Fake charts, statistics, progress, controls, data, or realtime freshness
- Hover-only actions, focus traps, nested scrolling traps, and unauthorized client-side hiding
- Provider names, model identifiers, secrets, infrastructure values, permanent signed URLs, and inactive-module data in customer-facing clients
