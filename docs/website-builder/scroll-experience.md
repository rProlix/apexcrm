# Scroll Experience

Scroll Experience is the Website Builder component with canonical section type `scroll_experience`. A business uploads one MP4, Nexora creates scrub-optimized desktop and mobile MP4 derivatives plus a WebP poster, and the published section maps scroll progress to `video.currentTime`.

## What it does

The uploaded video must already contain the movement the business wants. Scroll Experience controls the timeline. It does not create a new 3D camera move or alter objects inside a stationary video.

The editor supports start/end time metadata, 150-1000vh narrative distance, direct/smooth/cinematic response, forward/reverse playback, cover/contain/mobile crop presentation, overlay styling, accessible HTML copy and CTA, optional story beats, optional chapter navigation, and a reduced-motion poster fallback. Preview interaction is off by default so editor scrolling remains usable.

## Draft and publish

Each source replacement creates an immutable processing version. Section content stores `experienceId` and `experienceVersionId`; website snapshots therefore pin the selected media version. Publishing validates that every visible Scroll Experience references a READY version owned by the same tenant. The publisher deactivates old media bindings and creates active bindings for the new site version. Public media routes return only desktop, mobile, or poster derivatives from an active binding. Originals are never exposed.

## Performance and accessibility

The poster occupies the stage immediately. An IntersectionObserver starts media loading near the viewport. Derivatives up to the Blob threshold use an object URL and revoke it on cleanup; larger media uses S3 range-capable delivery through a short-lived redirect. The player uses refs and requestAnimationFrame without per-frame React state. It coalesces seeks, keeps the latest desired target, primes muted inline video after the first user interaction on iOS, and keeps readable HTML content when media fails. `prefers-reduced-motion` disables scrubbing.

Analytics are guarded once per session, component, and milestone: view, started, 25, 50, 75, completed, and CTA clicked.
