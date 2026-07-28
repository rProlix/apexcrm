# Inspection confidence aggregation

Confidence is the arithmetic mean of non-null confidence values from image analyses whose status is
`completed` or `needs_review`. Queued, processing, failed, skipped, and cancelled images do not
participate. If there is no valid confidence, inspection confidence is `null`; the UI displays
“Not available,” never an invented 0%.

A successful no-damage result is distinct from no analysis:

- No damage: completed image analysis, zero findings, valid confidence when supplied.
- No analysis: failed/skipped/cancelled image, no valid confidence.

Inspection aggregate states are `awaiting_images`, `queued`, `processing`, `partially_complete`,
`complete`, `complete_with_warnings`, `needs_review`, `failed`, and `no_analyzable_images`.
Successful sibling results and their findings survive partial failures. The authoritative database
function recalculates stored counters and confidence from normalized image-analysis rows.
