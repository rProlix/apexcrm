# Image backfill and migration

The current rollout is forward-compatible and safe for new images:

- new originals get deterministic private object keys
- new derivatives are created by the worker
- new AI cache entries are written after analysis
- exact duplicate originals are detected by SHA-256

For historical images, run a staged backfill plan before enabling deletion or aggressive archive policy:

1. Dry-run count by tenant and bucket prefix.
2. Compute missing hashes from existing originals.
3. Generate missing derivatives.
4. Insert missing asset rows.
5. Compare sampled signed URL rendering before and after.
6. Enable owner-reviewed archive/delete workflows only after audit sign-off.
