# Motion system

## Thesis

Motion explains state, hierarchy, and spatial continuity. It does not decorate idle screens.
ApexCRM uses quick feedback, finite live-state confirmation, trigger-derived overlay origins, and
layout continuity in high-value workflows. There are no ambient loops.

## Tokens

`lib/design-system/motion.ts` is the TypeScript source of truth and `app/globals.css` exposes matching
CSS variables.

| Purpose                   | Duration |
| ------------------------- | -------: |
| Instant keyboard response |     0 ms |
| Press and direct feedback |   120 ms |
| Local state change        |   180 ms |
| Overlay or drawer         |   240 ms |
| Meaningful layout reflow  |   280 ms |

Entrances use `cubic-bezier(0.16, 1, 0.3, 1)`. Exits use
`cubic-bezier(0.4, 0, 1, 1)`. Springs are reserved for a future case where an interruptible,
physics-based interaction materially improves control; none are required in the current system.

## Origin and continuity

- Pointer-opened overlays derive their origin from the invoking control.
- Command Center keyboard opening is immediate and focuses the query.
- Quick Peek uses the trigger's vertical center as the drawer origin.
- The inspection lightbox derives a two-dimensional origin from the selected image.
- Package cards and Action Required items use layout animation only when the underlying collection
  changes.

## Live changes

`OperationsRealtimeProvider` batches tenant-scoped events for 500 ms. `ui-live-change` runs once,
then stops. It never animates every card and never exposes a database row payload.

## Layering

The centralized layer order is base, sticky, drawer, popover, modal, then toast. Existing CSS layers
map to the same semantic order. Overlays lock page scroll, restore it on close, and keep focus within
the active dialog.

## Reduced motion

`MotionConfig reducedMotion="user"` covers Framer Motion. The reduced-motion media query removes
overlay movement, critical reveal, live confirmation, and decorative transform feedback while
preserving color, border, and state changes. Keyboard operation and all content remain available.

## Performance budget

- Routine transitions stay below 300 ms.
- No infinite animation or continuous polling was added.
- Heavy inspection lightbox code remains dynamically loaded.
- Realtime is consolidated to one active tenant channel.
- Remote command search is debounced, capped, abortable, and private/no-store.
- Layout animation is limited to changed collections, not full-page entrances.

## Rollback

Remove the consuming motion props/classes first, then remove the centralized tokens. Do not roll back
the focus management, tenant-scoped APIs, or consolidated realtime provider with visual motion;
those are functional and security improvements.
