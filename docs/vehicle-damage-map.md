# Vehicle Damage Map

The 2019 Ford Transit map uses the region taxonomy in `lib/van-damage/transit-blueprint.ts` and the precision geometry from `lib/van-damage/transit-geometry.ts`.

Driver and passenger terms follow the United States left-hand-driver convention used by the Fleet module: driver means left side and passenger means right side. Explicit side, front, rear, bumper, light, mirror, wheel, door, sliding-door, and roof terms map to supported Transit region IDs only when the taxonomy can resolve them safely.

Ambiguous labels such as `door`, `wheel`, `mirror`, `rear door`, or `tailgate` no longer choose an arbitrary side. They remain unmapped and require review. This prevents a loose text match from coloring a random panel.

Map highlighting is based on valid, non-dismissed findings matched through stable finding and canonical region IDs. Multiple findings in one region preserve the count and display the highest active severity. Needs Review, confirmed, repaired, dismissed, and selected states remain visually and accessibly distinct.

Selecting a region emits the stable region and evidence image identifiers, and selecting a finding or overlay uses the finding id rather than array position.
