# Inspection Compliance Operations

## Daily review

1. Open Inspection Compliance.
2. Confirm the date range and tenant-local time zone.
3. Review Missing and Consecutive Misses first.
4. Review Images Missing and Analysis Failed without asking drivers to resubmit evidence that is already safely stored.
5. Open the inspection or van from the primary action.
6. Use Action Required for ownership and follow-through.

Late is completed but not on-time compliant. Excused slots do not count against compliance and do not extend a missed streak. An upcoming open slot appears as processing/open, not missing.

## Incident handling

If automated comparison is unavailable, the private images remain reviewable. Do not close a damage case, confirm new damage, assign responsibility, or confirm a repair based only on automated output.

For repair verification, request a comparable damaged-region view plus wider vehicle context. Reject wrong-region, wrong-vehicle, blurry, obstructed, or materially different-angle evidence. Only an authorized human reviewer can make the final decision.

## Data recovery

All workflow events preserve stable tenant, vehicle, inspection, damage-case, repair, and evidence identifiers. Re-running synchronization is idempotent by action source/type and comparison pair/version.
