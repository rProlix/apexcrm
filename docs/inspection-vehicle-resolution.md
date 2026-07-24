# Inspection vehicle and profile-image resolution

## Root cause

The inspection page previously queried `vehicles` only when
`van_damage_inspections.van_id` was already populated. It did not consult the linked
upload session or the inspection’s tenant-scoped legacy van number. Separately, the
page always rendered a decorative van illustration and never resolved the Fleet
vehicle’s configured profile image.

## Authoritative resolution

`resolveInspectionVehicle` uses this order:

1. Inspection `van_id`, validated with the inspection tenant
2. Upload-session `van_id`, validated with tenant and business scope
3. Explicit legacy van number, matched within the tenant with a two-row ambiguity check
4. Missing

It never searches globally by van number. A stale cross-tenant ID cannot resolve.
Multiple same-tenant legacy matches produce an ambiguous state and are not guessed.
The current lazy repair strategy returns a safe resolved profile without mutating the
inspection. This preserves original data and provides auditable resolution-source
events. A future backfill may update only unambiguous rows with the same predicates.

Hosted validation checked 11 recent inspections: all 11 resolved to same-tenant
canonical vehicles, with no missing, ambiguous, or cross-tenant results.

## Profile image precedence

The inspection report uses only images already validated to belong to the resolved
same-tenant vehicle:

1. Explicit vehicle profile image
2. Explicit featured fleet image
3. Most recent image with an approved profile/front role
4. The existing Fleet product’s deterministic `automatic_first_upload` convention
5. Neutral placeholder

The automatic fallback is ordered by source upload position, capture record time, and
ID; it is not a random damage image. Hosted validation found nine current inspections
with a valid same-van automatic image and two vans with no image, which correctly use
the neutral placeholder.

Images remain private. The report requests temporary URLs through the existing
tenant-authorized media endpoint and shared cache. Image failure never hides vehicle
details or changes the vehicle relationship.

No schema or RLS change was required. Existing inspection, vehicle, media, damage,
and maintenance queries retain explicit tenant predicates.
