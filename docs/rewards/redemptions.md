# Redemptions

Catalog items can link directly to existing Store products. The database transaction checks active dates, inventory, tenant/program ownership, customer and global limits, and sufficient points before deducting points and creating a redemption.

A claim returns a one-time opaque `nex_red_` credential. Nexora stores only its SHA-256 hash and last four characters. Staff scan the credential and the server changes `available` or `claimed` to `redeemed`. Replays are rejected. The reusable membership barcode only identifies the reward account and cannot mutate a balance by itself.

Statuses are `available`, `claimed`, `redeemed`, `expired`, and `cancelled`. Canceling an unused redemption returns points with an idempotent adjustment.
