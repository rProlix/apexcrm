# Van Damage image caching and advanced search

Phase 3G adds private image reuse and URL-driven inspection discovery without changing Slack ingestion, AI prompts, worker processing, inspection creation, damage analysis, fleet rules, damage-map logic, or driver attribution.

## Private image caching

- Every image is authorized by tenant and business before a URL is returned.
- S3 remains private. URLs expire after 15 minutes and are cached only in process/browser memory, never persisted as permanent URLs.
- The API reuses an unexpired signature and returns the exact expiry. The browser cache refreshes 15 seconds early.
- Concurrent components share one in-flight URL request. Inspection thumbnails, galleries, profiles, fleet cards, comparisons, and lightboxes therefore reuse the same URL and browser object cache.
- Images lazy-load near the viewport. Only immediately visible thumbnails are prioritized. Long galleries render in batches of 18.
- Next Image supplies responsive AVIF/WebP optimization where supported, with progressive opacity/blur, skeletons, a broken-image state, and an accessible retry.
- A failed image load forces one fresh signature, covering URLs that expired between resolution and download.

## Inspection search

The Van Damage AI screen batch-loads tenant-scoped inspections and their vehicle, image, item, observation, and damage-case metadata. Maps aggregate those batches without N+1 queries. Search is debounced by 320 ms.

Search covers van number/name, inspection number/ID, Slack driver/display name, damage type, vehicle region, notes, and AI summary. Filters cover driver, van, status, severity, damage type, region, SOD/EOD, damage history type, review source/state, image presence, and repair state.

Sorting uses existing timestamps only:

- upload order: `slack_upload_at`, falling back to inspection `created_at`;
- damage order: damage-case `first_detected_at` / `last_observed_at`, falling back to damage-item `created_at`;
- inspection/update/review order: the matching inspection fields.

All search, sort, filter, quick-filter, and pagination state lives in the query string. The pinned search and horizontally scrollable quick filters remain available on mobile; detailed mobile filters open in an accessible modal drawer.
