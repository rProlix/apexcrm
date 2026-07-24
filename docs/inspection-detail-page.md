# Inspection detail report

The inspection detail route remains
`/dashboard/damage-ai/inspections/[inspectionId]` and continues to use the shared
`InspectionExperience` component. The report now follows an operational hierarchy:

1. Van, SOD/EOD period, tenant-local timestamp, uploader, and status
2. Compact counts for images, new damage, existing observations, Level 3, and review
3. Resolved vehicle profile and private profile image
4. Level 3 critical findings
5. Damage summary, Transit damage map, and inspection gallery
6. Findings with direct evidence actions
7. Processing timeline and activity
8. Owner-only Inspection Metadata

Level 3 findings appear before routine findings. First reporter and latest uploader
remain distinct, and the report explicitly states that reporter attribution does not
determine responsibility.

The gallery preserves capture order, incrementally renders large sets, lazy-loads
private images, and reuses the shared short-lived signed-URL cache. A finding opens
evidence only when it has a real `image_id`; no evidence relationship is inferred.
The existing 2019 Ford Transit map geometry is unchanged.

The layout uses a wrapping section navigator, stacked mobile cards, touch-sized
actions, semantic headings, keyboard-operable controls, and visible focus styles.
Print hides internal navigation, interactive controls, and owner diagnostics.

Provider names and model identifiers are not rendered. Failed or pending states use
provider-neutral automated-analysis language.
