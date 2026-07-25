# Inspection Damage Overlay

Inspection image overlays use one canonical geometry resolver in `lib/van-damage/overlay-geometry.ts`.

Canonical geometry is `{ x, y, width, height }` normalized from `0` through `1` against the correctly oriented source image. The resolver accepts legacy normalized boxes, `0-100` percent boxes, and pixel boxes when source dimensions are available. It rejects missing, non-finite, negative, oversized, tiny, cross-image, and low-confidence geometry instead of drawing a misleading box.

Overlay rendering uses `DamageOverlayFrame`, which renders the full image with `object-contain`. The overlay is positioned on the actual displayed image element, so card, mobile, and lightbox views share the same coordinate system and avoid crop offsets. The old card overlay path used cropped/fill media and direct percentage math, which could align boxes to the container rather than the visible image.

EXIF orientations `3`, `6`, and `8` are corrected in the resolver. Axis-swapping orientations use the rotated display dimensions when pixel geometry is provided.

Invalid geometry remains visible in the findings list and is surfaced as a “location needs review” count on the image. The original model output remains in owner-safe diagnostics; the tenant UI does not invent coordinates.
