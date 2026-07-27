# Before/After Damage Comparison

Inspection detail pages resolve the most recent **valid comparable** prior inspection for the same tenant and canonical van. Timestamp alone is insufficient.

The resolver rejects another tenant, another van, future evidence, deleted/rejected evidence, wrong-van records, invalid duplicates, and evidence without an acceptable matching canonical view. Images are paired by canonical view, never by upload order. Unknown or low-quality views cannot support a confident damage claim.

The UI supports responsive side-by-side and swipe views using private signed-image endpoints. It stores and transmits stable image IDs, not permanent URLs. Low-confidence evidence displays an explicit caution and remains useful for manual review.

Automated classifications are advisory. The data model keeps automated and human-reviewed classifications in separate columns, with reviewer, note, and timestamp. A human correction does not erase original evidence. “Not visible” is not equivalent to “repaired,” and uploader identity is not damage responsibility.

The comparison schema includes runs, canonical image pairs, localized findings, comparability/alignment confidence, stable evidence references, sanitized failure codes, and audit-ready review fields.
