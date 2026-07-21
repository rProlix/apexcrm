# 2019 Ford Transit Vehicle Damage Map

The inspection report previously used a generic top-down silhouette with five floating HTML controls. Phase 3C.2 replaces that geometry in place with an original, inline SVG blueprint representing a pre-facelift 2019 North American Ford Transit full-size cargo van. No Ford logo, badge, marketing artwork, raster blueprint, external SVG, or permanent image URL is used.

## Vehicle and configuration

The default is a long-wheelbase, medium-roof, single-rear-wheel cargo van with a passenger-side sliding cargo door and split rear doors. `resolveTransitConfiguration` also recognizes regular and extended wheelbases, low and high roofs, dual rear wheels, driver/both/no sliding-door metadata, and passenger configuration. The default remains deterministic when profile specifications are absent. Variant data alters the SVG proportions and supported details without creating separate region systems.

The model resolver accepts Ford Transit, Transit Cargo Van, Ford Transit Cargo, T-150/T-250/T-350, and Transit 150/250/350 labels when the year is 2019 or absent. Missing vehicle data uses the module's Transit default. Transit Connect, post-2019 Transit vehicles, and unrelated known models use the preserved generic schematic so they are not presented as a 2019 full-size Transit.

## Blueprint architecture

`lib/van-damage/transit-blueprint.ts` owns model/configuration resolution, canonical aliases, view routing, and static region geometry. `FordTransit2019DamageMap.tsx` renders the geometry, interaction states, count markers, legend, text summary, and fullscreen dialog. The static geometry is shared across inline and fullscreen presentation and is not regenerated from inspection data.

Five coherent orthographic views are provided:

- Driver side: short hood, steep windshield, tall front door, uninterrupted cargo panels, single wheels, rocker, mirrors, lights, and bumper corners.
- Passenger side: the same wheelbase and roof geometry with a distinct, non-overlapping sliding cargo door and track.
- Front: pre-facelift compact upper grille, wide lower opening, swept headlights, broad bumper, mirrors, hood, windshield, and roof.
- Rear: windowless split cargo doors by default, center seam, vertical taillights, lower door panels, roof, and three bumper regions. Passenger configuration may render rear glass.
- Top: long cargo roof, front taper, hood, windshield boundary, roof sections and edges, mirrors, split-door boundary, and bumpers.

The default SVG viewBox is `0 0 800 360`. Interactive regions are real SVG paths/groups, while outline, glass, seams, wheel detail, and technical guide lines remain noninteractive. Small mirrors, lights, edges, and seams receive enlarged transparent SVG strokes rather than HTML hotspots.

## Canonical compatibility

Existing detailed IDs are preserved where available, including bumpers, hood, windshield, lights, mirrors, doors, panels, wheels, taillights, and roof sections. Broader historical values such as `front_bumper`, `rear_bumper`, `driver_side`, `passenger_side`, `roof`, `mirror`, `wheel`, `door`, `tailgate`, and `liftgate` resolve to compatible Transit geometry without changing stored data or pretending the vehicle uses a liftgate. Unknown and interior-only locations remain unmapped and stay visible in the findings list.

When both fields exist, a human-reviewed `canonical_region` takes precedence over the AI `vehicle_area`. Selecting a finding chooses its resolved view and panel, focuses its supporting image, and preserves its finding deep link. Selecting a map region filters matching findings and focuses the latest supporting photo. Selecting a photo annotation dispatches the existing inspection event contract back to the map. These actions use stable finding, image, and region IDs and do not query the backend per panel.

## States and accessibility

Severity uses the existing inspection values: low, medium, high, and critical. Regions additionally expose needs-review, damage-case confirmation, repaired, dismissed, selected, hovered, and keyboard-focused presentation. Repaired and dismissed states use patterns, review uses a dashed border, every damaged region includes a numeric marker, and a nonvisual/text summary prevents color-only communication.

Each view has an accessible tab selector. Region groups are keyboard reachable and support Enter and Space. Their labels include view region, severity, finding count, review status, confirmation, and selection. An `aria-live` announcement reports selection changes. Escape closes fullscreen, focus returns to the fullscreen trigger, small controls meet touch-size targets, and reduced-motion users do not receive map transition animation.

## Responsive and performance behavior

The SVG preserves its aspect ratio and scales without horizontal scrolling. Controls wrap on narrow screens, region hit areas remain SVG-native, and fullscreen uses the same blueprint with a unique ID prefix to prevent duplicate SVG IDs. Region summaries and configuration are memoized. Hover and focus state stay inside the map component, avoiding inspection-report-wide rerenders. The implementation adds no Three.js, WebGL, charting, raster, network, or database dependency.

## Historical compatibility and limitations

- Historical findings and deep links are not rewritten.
- Existing signed-image and tenant authorization behavior is unchanged.
- Previous inspections currently expose summary records rather than historical region/finding geometry, so the related-inspection cards remain the supported comparison entry point.
- Unknown vehicles retain the generic schematic. Additional model-specific blueprints can be registered behind the resolver later without changing canonical damage records.
- Configuration selection depends on trusted vehicle-profile metadata; it does not infer body configuration from inspection photos.
