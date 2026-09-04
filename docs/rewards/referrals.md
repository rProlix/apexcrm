# Referrals

Each reward membership has a tenant-scoped, non-sequential referral code. An authenticated customer can claim another member's code once. Self-referral and repeated referred-customer use are rejected by application checks and database constraints.

Referral programs qualify on signup, first purchase, or first appointment. Qualification changes `pending` to `qualified`, awards each side once with stable ledger keys, and ends at `rewarded`. All customer and program lookups include `tenant_id`.
