# Cinematic Scroll

Cinematic Scroll is the Website Builder's versioned scroll-story configuration. It extends the
existing `scroll_experience` section so legacy published video sections, tenant resolution,
draft/version publishing, custom domains, and immutable media bindings keep using the canonical
Website Builder pipeline.

## Architecture

- `lib/website-cinematic/schema.ts` is the version 1 Zod contract and normalizer. Never render raw
  JSON from a section.
- `lib/website-cinematic/presets.ts` contains editable configuration objects. Presets are data, not
  bespoke React layouts.
- `lib/website-cinematic/runtime.ts` owns deterministic clip/source mapping.
- `components/website/cinematic/CinematicRenderer.tsx` is the code-split public leaf. One normalized
  GSAP timeline and one ScrollTrigger drive layers, scenes, and video time. Scroll updates are
  coalesced through one `requestAnimationFrame`; page progress, clip-local metadata progress, and
  pending seek time have separate state channels. It initializes near the viewport and tears down
  its frame, GSAP context, trigger, observers, media cache, and optional Lenis consumer.
- `components/website/cinematic/CinematicStudio.tsx` is authenticated editor-only code. It provides
  presets, modes, layers, properties, responsive canvases, a normalized timeline scrubber, undo/redo,
  and 900 ms autosave through the existing tenant-authorized section API.
- Existing Scroll Experience upload/worker tables remain the source of processed MP4, mobile, and
  poster assets. Public media still requires a valid published binding.

## Configuration and publishing

The cinematic configuration is stored at `site_sections.content.cinematic`. It includes
`version: 1`, an `engine` (`layers`, `video`, or `hybrid`), section behavior, scenes, layers, tracks,
video clips, and accessibility fallback. Draft edits remain in the normal draft section graph.
The existing publisher snapshots and validates section content before the public renderer receives
it. Public pages resolve `site_settings.last_published_version_id` and render that immutable
`site_versions.snapshot`; an invalid referenced checkpoint fails closed. Mutable `site_sections`
remain the preview/editor source and cannot authorize public media.

Animation progress is always normalized from 0 to 1. Track positions map into a 1000-unit paused
GSAP timeline using absolute offsets, allowing overlap without shifting later tracks. Video chains
use stable ordering, weighted ranges, and tiny seam fades. Mobile sources override desktop sources
when supplied. Responsive layer and animation overrides inherit desktop to tablet to mobile.

## Processing recovery

The upload completion route records a tenant-bound, idempotent job before sending the SQS message.
The worker heartbeats message visibility during FFmpeg work and safely ignores completed duplicates.
The editor polls active jobs. A non-terminal version with no status update for 30 minutes is treated
as stale: the authenticated retry route clears its old claim/message identifiers and reuses the same
idempotency key to enqueue it again. Failed jobs expose the same manual retry action.

## Adding capabilities

- New preset: add a valid `CinematicConfig` to `CINEMATIC_PRESETS`; never add a preset-only renderer.
- New layer type: extend the Zod enum and `Layer` switch, retain semantic HTML and an accessible
  static representation.
- New animation property: add a bounded value to `transformSchema`, then map it to a GPU-friendly
  GSAP property. Avoid layout properties during scroll.
- New video source: extend the clip schema and source selector. URLs must remain relative HTTP(S)
  storage/CDN URLs; never accept filesystem or executable URLs.
- Future generation provider: implement a separate server-side adapter with create, generate,
  status, and download methods. Generated outputs must enter the same tenant-owned asset pipeline.

## Security and accessibility

Section create/update routes enforce owner/admin authorization, resolve the database-owned tenant,
check the `website` module's `cinematic_scroll_enabled` entitlement, and validate the complete Zod
configuration. Customers cannot edit. Arbitrary SVG markup is never injected; SVG is served as an
image. CTA and asset URLs reject executable schemes. Reduced-motion visitors receive the poster and
semantic layers without pinning or transform choreography.

## Troubleshooting

- No pinning: inspect ancestors for `overflow: hidden` or transforms. Cinematic sections are exempt
  from the generic premium overflow/entrance wrappers.
- Video does not seek: confirm metadata duration, range-request support, active published binding,
  and the exact desktop/mobile media endpoint. Confirm the animation-frame coordinator receives page
  progress and does not overwrite it with clip-local metadata progress.
- Video remains queued: wait for the 30-minute stale threshold, then confirm the editor re-queues it
  and the worker receives the replacement message. A visible failed state can be retried immediately.
- Trigger positions stale: verify assets have dimensions and call `ScrollTrigger.refresh()` only
  after layout settles; avoid refresh loops.
- Duplicate motion: ensure one renderer instance owns one scoped GSAP context and cleanup ran during
  navigation or breakpoint changes.

Run `npm run test:scroll-experience`, `npm run type-check`, and `npm run build` before release.
