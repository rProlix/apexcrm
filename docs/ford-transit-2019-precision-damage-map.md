# 2019 Ford Transit precision damage map

## Target vehicle and default

The production default is a North American, pre-facelift 2019 Ford Transit full-size cargo van with a 147.6-inch (marketed as 148-inch) wheelbase, regular LWB body, medium roof, single rear wheels, passenger-side sliding cargo door, split hinged rear doors, and windowless commercial cargo body. It is deliberately not a Transit Connect, Transit Custom, Sprinter, ProMaster, or 2020-and-newer facelift Transit.

No Ford oval, wordmark, trim badge, marketing artwork, copied blueprint, or reference raster ships with the application. The SVG is an original technical rendering whose body geometry is recognizable without branding.

## Reference methodology and licensing

Geometry is based primarily on Ford's official 2019 North American material:

- The [2019 Transit specification guide](https://www.ford.com/cmslibs/content/dam/brand_ford/en_us/brand/resources/general/pdf/guides/19_Transit_SpecLite.pdf) supplies the wheelbase, length, height, width, track, overhang, door-opening, roof, SRW/DRW, and configuration tables.
- The [2019 Transit brochure](https://www.ford.com/cmslibs/content/dam/brand_ford/en_us/brand/resources/general/pdf/brochures/19_Transit_Accessiblity_full.pdf) supplies side, front three-quarter, rear, cargo-door, roof-family, mirror, sliding-door, and pre-facelift fascia references.
- Ford's [Transit body decoder](https://www.fordpro.com/en-us/tools/orders/ordering-production/transit-body-decoder/) provides a cross-check on the 148-inch/body/roof naming model.

Ford reference images are used only during comparison. They are not copied into source control, `public`, test snapshots, or the production bundle. Ford Media marks its imagery for editorial use; the calibration tool therefore accepts a developer-supplied local file through an object URL and never uploads or persists it.

## Dimensional model

`lib/van-damage/transit-geometry.ts` is the geometry authority. Dimensions are stored in inches and projected into a normalized `800 × 400` SVG canvas. The default 148 MR cargo values are:

| Dimension                         |          Value |
| --------------------------------- | -------------: |
| Wheelbase                         |       147.6 in |
| Overall length                    |       235.5 in |
| Overall height                    |       100.7 in |
| Front overhang                    |        40.3 in |
| Rear overhang                     |        47.6 in |
| Width excluding mirrors           |        81.3 in |
| Width including short-arm mirrors |        97.4 in |
| Sliding-door opening              | 51.2 × 63.0 in |

The side projection reserves 692 units for overall length and computes front edge, both axle centers, rear edge, roof datum, ground line, beltline, hood endpoints, windshield endpoints, cab/cargo boundary, sliding-door boundary, and rear-door plane. Configurations are regenerated from physical values; the renderer no longer scales a completed drawing horizontally or vertically.

The front and rear projections share the configured body width, mirror width, centerline, roof datum, beltline, body bottom, and bumper datum. The top projection uses the same overall length, width, cab boundary, rear-door plane, and mirror span. Driver/passenger wheel centers and diameter come from the same side geometry.

## View construction

- Driver side uses the short hood, steep windshield, cab door, uninterrupted cargo panel by default, rear quarter, rocker, measured axles, mirror mount, lamps, and overhangs. A driver sliding door appears only when configured.
- Passenger side shares physical dimensions but has the configured sliding-door opening and track. It is not a blind mirror of the driver panel structure.
- Front uses the pre-2020 compact upper grille, broad trapezoidal lower grille, swept headlamps, short hood, windshield, mirrors, fenders, and three bumper regions.
- Rear uses two asymmetric selectable cargo-door leaves, center seam, tall vertical taillamps, lower door panels, step bumper, and optional rear glazing.
- Top shares the side length and end-view width, with hood, windshield boundary, roof sections, roof edges, mirrors, split-door plane, and bumpers.

Interactive regions are built from named anchors and small path helpers (`rect`, `polygon`, and `ellipse`). The static metadata still owns stable labels, aliases, view routing, and hit-area hints. Expanded transparent strokes preserve usable pointer targets for lights, mirrors, seams, and edges.

## Configuration resolution

`resolveTransitConfiguration` reads structured vehicle metadata. It supports:

- 130-inch regular wheelbase;
- 148-inch regular body;
- 148-inch extended body;
- low, medium, and high roof;
- SRW and DRW;
- passenger, driver, dual, or no sliding door;
- cargo and passenger bodies;
- windowed and windowless rear doors.

Incomplete metadata falls back to the explicit 148/regular/medium/SRW/passenger-slider/windowless cargo default. `extended` changes the physical rear overhang rather than the wheelbase. Low, medium, and high roof values move roof and opening landmarks without stretching wheels, wheelbase, or bumpers.

The model resolver accepts 2019 full-size Transit, Transit Cargo Van, Transit 150/250/350, and T-150/T-250/T-350 labels. Transit Connect, unrelated vehicles, and 2020+ Transit use the existing generic fallback. Missing model data uses the fleet default.

## Calibration tool

Run the application in development and open:

`/dashboard/damage-ai/dev/transit-calibration`

The route calls `notFound()` in production. The workbench provides a local reference file picker, reference opacity, reference visibility toggle, outline-only mode, landmark markers with coordinates, 20-unit grid, view selector, 130/148 wheelbase selector, regular/extended body selector, roof selector, and live physical metrics. A selected image remains a browser-local blob URL and is revoked when replaced or unmounted.

Calibration procedure:

1. Obtain a legitimately accessible reference for the exact view and configuration.
2. Load it with the local file control; never add it to the repository.
3. Select the matching wheelbase, body, roof, and view.
4. Toggle the overlay rapidly and adjust opacity.
5. Check axle centers first, then overall length/height, overhangs, roofline, hood/windshield transition, doors, mirrors, lamps, and bumpers.
6. Change structured dimensions or landmarks, not rendered path fragments.
7. Run geometry, canonical, interaction, type, lint, format, and build validation.

## Compatibility, accessibility, and performance

Canonical region IDs and aliases remain unchanged, including historical parent values for bumpers, sides, roof, mirrors, wheels, doors, tailgate, and liftgate terminology. Existing map-to-finding, finding-to-map, annotation-to-map, image focus, deep-link, fullscreen, lifecycle, and severity behavior continues to use stable IDs. Unknown and interior-only locations remain safely unmapped.

All views remain keyboard-tabbed; regions support Enter and Space, communicate selection and damage state without color, keep enlarged hit areas, and preserve fullscreen focus restoration. The SVG uses `preserveAspectRatio`, responsive width, wrapping view controls, and no horizontal scrolling. Geometry generation is deterministic and memoized by resolved configuration. It introduces no runtime requests, raster fallback, 3D engine, WebGL, or database change.

## Testing and visual regression

Programmatic tests verify exact default dimensions, measured axle spacing, 130/148 behavior, regular/extended overhang, roof variants, view bounds, nonempty/finite paths, door-side variants, stable canonical IDs, model exclusions, and accessibility state text. Existing inspection interaction tests cover deep links, region filtering, finding selection, annotation synchronization, fullscreen reuse, and lifecycle presentation.

The repository does not contain a screenshot-regression harness. The development calibration workbench is the lightweight manual visual regression surface; reference images intentionally cannot be committed as golden snapshots. Review all five views and mobile/fullscreen layouts before changing geometry constants.

## Remaining approximations

This is a measured, original 2D damage-selection diagram, not Ford CAD data. The wheel/tire diameter is derived from the documented 235/65R16C SRW tire. Hood curvature, windshield rake, roof crown, mirror shell, lamp curves, grille cutouts, panel stamping, and three-dimensional foreshortening are reference-calibrated approximations. Orthographic front/rear/top projections prioritize coherent panel selection and touch targets over manufacturing tolerances.

## Adding another blueprint safely

Create a separate typed dimensions/landmarks module and register it behind `resolveVehicleBlueprint`; do not mutate Transit geometry for an unrelated model. Establish an explicit default configuration, use manufacturer dimensional references, preserve canonical aliases through a mapping layer, add a development-only local-reference calibration view, add geometry/model/canonical tests, and retain the generic fallback until the new blueprint is verified. Never infer a specific vehicle from a vague label and never bundle third-party reference assets.
