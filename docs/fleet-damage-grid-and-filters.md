# Fleet Damage Grid and Filters

Fleet card damage state is resolved by `lib/van-damage/fleet-damage.ts`. The resolver receives tenant-scoped vehicles, active damage cases, completed/processing/failed analyses, and maintenance summaries, then returns card-level data only.

Damage level source of truth:

- Level 0: no active confirmed damage cases.
- Level 1: highest active confirmed severity is Level 1.
- Level 2: highest active confirmed severity is Level 2.
- Level 3: highest active confirmed severity is Level 3 or higher.

Dismissed, repaired, resolved, archived, and cross-tenant damage cases are excluded. Needs Review remains a separate indicator and does not silently promote uncertain findings to confirmed severity.

Analysis age uses the latest completed damage-analysis timestamp from AI runs or inspection completion. Inspection creation time is shown separately as latest inspection activity and is not treated as completed analysis. Vans without a completed analysis are labeled `No analysis`.

Van profile image precedence reuses `selectVehicleProfileImage`: explicit primary image, featured image, most recent approved profile-like image, then neutral placeholder. The Fleet grid passes image IDs to the existing signed-image component and does not persist signed URLs.

The Fleet page now includes a responsive all-vans grid:

- `2xl`: six columns.
- `xl`: four columns.
- `lg`: three columns.
- `sm`: two columns.
- mobile: one column.

Filters are URL-backed GET parameters for search, damage level, analysis age, operational status, and sort. Search includes van number, display name, plate, make, and model.

The filter bar is intentionally responsive: controls wrap at small, medium, and large widths, then collapse into a single compact row only at `2xl`. This keeps long select labels inside the Fleet page container instead of forcing horizontal page overflow.
