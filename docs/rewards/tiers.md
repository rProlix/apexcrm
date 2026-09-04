# Customer tiers

Tiers are ordered by rank and can qualify on points, spend, visits, purchases, or appointments with lifetime or rolling 12-month windows. The current engine automatically evaluates point-based tiers after reward events. Tier rows include a points multiplier and a JSON benefits field for exclusive rewards, birthday benefits, discounts, early access, and custom perks.

Manual overrides are stored on `reward_customer_tiers` with a reason and actor. Changes append `reward_tier_events`; they do not erase history. The customer card shows current tier and progress to the next configured threshold.
