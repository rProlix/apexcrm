# Van damage image storage architecture

Van damage evidence is stored as private tenant-scoped S3 objects. Object keys are deterministic and start with `tenants/{tenant_id}/`, which keeps the tenant boundary visible in both code and infrastructure policy.

The worker preserves the original upload, computes a SHA-256 hash, creates WebP derivatives for application display, and records every asset in `van_damage_image_assets`. Signed URLs are short-lived and generated only after the normal van-damage access check succeeds.

Current asset classes:

- `original`: immutable private evidence, retained longest.
- `thumbnail`: small grid/list preview.
- `medium`: default inspection-page rendering.
- `large`: fullscreen review rendering.
- `overlay` / `export`: reserved for generated evidence artifacts.

No permanent public URLs are stored for inspection evidence.
