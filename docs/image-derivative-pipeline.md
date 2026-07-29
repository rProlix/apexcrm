# Image derivative pipeline

The van damage worker now generates derivatives after the original image is safely uploaded.

Profiles:

- Thumbnail: max 480px, optimized for grids and quick cards.
- Medium: max 1600px, default inspection display.
- Large: max 2800px, fullscreen/detail review.

All derivatives are WebP, tenant-tagged, and recorded in `van_damage_image_assets`. If derivative generation fails, the worker keeps the original evidence and continues analysis instead of deleting or blocking the inspection.

Client image components request the smallest useful profile and fall back to the original if a derivative is not available.
