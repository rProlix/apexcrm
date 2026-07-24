# Recent Inspections

The shared Recent Inspections list prioritizes van number, tenant-local inspection
time, SOD/EOD classification, processing or completion status, Level 3 damage, and
review state. Driver, image count, new-damage count, and existing-damage observations
are secondary scan details. Provider responses and model identifiers are never shown.

Records are grouped as Today, Yesterday, Earlier this week, and Older using the
tenant-configured timezone. Default sorting remains newest inspection first with a
stable server-bounded page. Search, quick filters, advanced filters, sorting, and page
remain in the URL. Detail links carry a validated dashboard return URL so navigation
back restores the list state.

Only one representative private thumbnail is requested per visible inspection. The
authorized image component lazily obtains short-lived URLs and reuses the shared
signed-URL cache. Full galleries and raw analysis payloads are not loaded by the list.

Desktop uses a compact aligned row; mobile stacks the same critical status and uses a
full-width action without horizontal scrolling. Loading skeletons mirror the final
layout. Empty, database-error, processing, and failed-analysis states are distinct and
provider-neutral.
