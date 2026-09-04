# Points

Create earning rules under Rewards > Earning Rules. Supported sources include completed orders, confirmed payments, completed or first appointments, birthdays, referrals, and manual awards. Rules can be fixed, spend based, product specific, category specific, service specific, or visit based.

The engine applies minimum spend, per-event caps, current tier multiplier, and active promotion modifiers. Point changes use `apply_reward_points`, which verifies tenant ownership, locks the customer balance, inserts an immutable ledger entry, updates the balance cache, records analytics, and queues one coalesced Wallet refresh.

Birthday rules use a year-specific idempotency key. Expiring earned entries create separate `expired` transactions. Refunds create `refund_reversal` transactions linked to the original ledger entry.
