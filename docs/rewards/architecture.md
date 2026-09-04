# Rewards architecture

Nexora Rewards extends the existing application and keeps `tenant_id` as the only tenant source of truth. A customer can have one membership per tenant and program. No customer, balance, referral, pass, or analytics lookup is global.

## Data flow

Completed store order or appointment -> normalized earning rules -> atomic ledger RPC -> cached balance -> tier recalculation -> coalesced Wallet update.

`rewards_transactions` is the immutable points ledger. `rewards_balances` is a transactionally maintained read cache. Corrections create `adjusted`, `refund_reversal`, or `expired` entries. They never edit history. `reward_punch_definitions` contains tenant configuration; `reward_punch_cards` contains customer cycles; `reward_punch_card_events` is the punch audit ledger.

Every automatic award includes a stable idempotency key made from tenant, source event, and rule or punch definition. Database unique indexes and advisory transaction locks prevent duplicate awards and overspending.

## Integrations

- Store: awards on the first transition to `delivered` or `completed`, never on pending creation.
- Appointments: awards on the first transition to `completed`; canceled and no-show appointments do not earn.
- Payments: successful refunds append proportional reward reversals through the canonical invoice/order relationship. Stripe and Square remain provider-neutral.
- Staff Activity: manual points changes and redemption actions write sanitized audit records.
- Wallet: the reward domain model is provider-neutral. `AppleWalletProvider` adapts it to an Apple Store Card pass; Google can be added without changing reward calculations.

## Feature availability

The existing `rewards` module gate remains authoritative. Program flags control points, redemptions, punch cards, and Apple Wallet. Apple signing infrastructure is optional; missing credentials disable Wallet only, not Nexora.
