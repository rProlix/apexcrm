# Van Damage SOD/EOD Classification

Phase 3F adds automatic Start of Day and End of Day labels to Van Damage AI inspection history.

## Calculation

Inspection period is computed dynamically from the inspection or upload timestamp. No database column or migration is required because existing timestamps are already immutable enough for this derived display state.

- `SOD` means Start of Day.
- `EOD` means End of Day.
- `UNKNOWN` is reserved for missing, invalid, or unparsable timestamps.

The canonical helper is `getInspectionPeriod()` in `lib/van-damage/inspection-period.ts`.

## Timezone Behavior

The helper resolves timezone in this order:

1. Tenant timezone fields when present.
2. Tenant branding or settings timezone fields when present.
3. Organization timezone supplied by the caller.
4. Application default, `America/Los_Angeles`.

The browser timezone is not used when a tenant timezone is available. UTC is not the primary fallback because existing ApexCRM scheduling flows use `America/Los_Angeles` as the application default.

## Badge Semantics

The shared `InspectionPeriodBadge` component displays both short text and accessible labeling:

- `SOD`, announced as `Start of Day inspection`.
- `EOD`, announced as `End of Day inspection`.
- `Unknown`, announced as `Inspection period unknown`.

SOD uses the green semantic badge treatment. EOD uses the orange semantic badge treatment. The visible text remains present so the UI does not depend on color alone.

## Surfaces

Badges are shown on the inspection list, inspection detail header, overview metadata, timeline, activity feed, related inspections, van profile upload history, van damage history, fleet attention latest upload, and driver profile history.
