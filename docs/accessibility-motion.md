# Accessibility and motion

## Required behavior

- Honor operating-system `prefers-reduced-motion`.
- Preserve full keyboard access when movement is removed.
- Keep visible focus rings and logical focus order.
- Trap focus in modal dialogs, drawers, and the inspection lightbox.
- Close overlays with Escape and restore focus to the invoking control.
- Use status text and icons; never communicate severity through color alone.
- Keep touch targets at least 40 px in primary shell and overlay controls.
- Prevent background scroll while modal content is active.

## Implemented coverage

The dashboard shell uses Framer Motion's user preference mode. CSS removes signature movement,
critical reveal, live confirmation, and transform feedback for reduced-motion users without applying
a global near-zero animation duration. Command Center, Quick Peek, and the image lightbox manage
focus and Escape. Action Focus Mode ignores navigation shortcuts while the user is editing a field.

Inspection overlays have descriptive labels for damage type and region. Live Operations Pulse uses
polite announcements and a finite visual confirmation. Loading and error states use semantic labels
or alerts.

## Manual checks

Validate at 375 px, 768 px, 1280 px, and 1536 px:

1. Open Command Center using Command/Ctrl+K and complete a result with keyboard only.
2. Open and close Quick Peek using Tab, Shift+Tab, Escape, backdrop, and browser Back.
3. Use Focus Mode without a pointer and verify form fields keep arrow-key behavior.
4. Open an inspection image, zoom, change images, and close back to the source thumbnail.
5. Enable reduced motion in the operating system and repeat the flows.
6. Confirm high zoom and long labels do not hide primary actions.

Authenticated tenant data is required for a complete end-to-end manual run. If that session is not
available, build and source-level accessibility checks are necessary but not equivalent to a signed-in
assistive-technology review.

For this implementation pass, the available browser runtime reported no selectable browser and the
local server had no public Supabase runtime configuration. Automated focus/motion source checks,
type-check, lint, production build, and unauthenticated routing smoke checks passed; the signed-in
manual checklist remains an explicit follow-up.
