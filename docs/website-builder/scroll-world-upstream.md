# Scroll World upstream review

Repository: https://github.com/oso95/scroll-world

Reviewed main commit: `71cc36d3bb150248ae36a2c552f9cbf88802a79c`

License: MIT, copyright (c) 2026 cyw. See `THIRD_PARTY_NOTICES.md`.

Files reviewed:

- `README.md`
- `skills/scroll-world/SKILL.md`
- `skills/scroll-world/references/scrub-engine.js`
- `skills/scroll-world/references/index-template.html`
- `skills/scroll-world/references/pipeline.md`
- `LICENSE`

## Behaviors adopted

- Pre-rendered MP4 timeline controlled with `video.currentTime`
- Normalized scroll progress and requestAnimationFrame smoothing
- Latest-target seek coalescing instead of decoder backlog
- Poster-first rendering and first-frame paint confirmation
- Lazy loading and size-bounded Blob seek mode
- Mobile-specific media, muted `playsInline`, and iOS user-interaction priming
- Sticky viewport stage, safe-area padding, reduced motion, and accessible content
- Short-GOP H.264 derivatives with faststart and no audio

## Intentional Nexora adaptations

Nexora uses a typed React component instead of injecting the upstream vanilla DOM/CSS runtime. This implementation starts from one business-uploaded MP4, so it does not copy the upstream paid AI generation workflow, multi-scene clips, connector seams, or image-sequence serving. Tenant storage, immutable publishing bindings, analytics, RLS, SQS processing, and builder controls are Nexora-native.
