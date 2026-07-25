# Premium interactions

## Product direction

The application is a quiet, high-density operations command center: graphite surfaces, one
tenant-controlled accent, restrained radii, tabular operational metrics, and action-first hierarchy.
Typography, layout, color, and motion rules live in `DESIGN.md`.

## Signature interactions

- Global Command Center: one visible and keyboard-accessible entry point for authorized navigation,
  actions, and tenant records.
- Quick Peek: spatially connected record context without losing the current list or filter state.
- Action Focus Mode: one confirmed human decision at a time, with source evidence and queue progress.
- Inspection evidence continuity: selected findings synchronize the image gallery, map, and detail
  list; Level 3 evidence receives one finite reveal.
- Package application preview: layout-preserving builder and an explicit enable/disable diff before
  confirmation.

## Operational refinements

- What Changed Today refreshes after consolidated live events.
- Live Operations Pulse reports a safe event label and freshness without displaying raw payloads.
- Contextual Action Rails use server-approved links only.
- Maintenance status changes and optional setup dismissal use inline, reversible confirmation
  controls instead of browser prompts.
- Loading, empty, error, success, stale, and unavailable states remain explicit and data-accurate.

## White label and terminology

The tenant accent is resolved server-side and exposed through safe CSS variables. Contrast fallbacks
prevent unreadable controls. Product-facing AI copy is provider neutral; provider names, model
identifiers, infrastructure diagnostics, raw responses, and secrets are excluded from these
interactions.

## Performance and accessibility

All overlays are keyboard closable, trap focus, restore focus, and preserve visible focus rings.
Desktop drawers become full-width mobile sheets. Motion is finite and reduced-motion aware. Private
images continue through signed, tenant-authorized endpoints and are not placed in public URLs.
