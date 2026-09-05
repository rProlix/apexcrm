/**
 * Shared quality direction for website-generating prompts.
 *
 * Keep this focused on decisions the current renderer can honor. The goal is
 * consistent art direction without forcing every business into the same visual
 * trend or asking the model to invent unsupported facts.
 */
export const PROFESSIONAL_WEBSITE_QUALITY_RULES = `
PROFESSIONAL WEBSITE QUALITY STANDARD:
- Design for this specific business, audience, offer, and price point. Do not default to an "AI" look.
- Use one page-level theme, one accent color, and one consistent corner-radius system.
- Prefer hierarchy, spacing, strong typography, and real imagery over decorative effects.
- Do not automatically use purple gradients, glow effects, glass cards, warm beige luxury palettes, or three identical feature cards.
- Use serif typography only when the category or established brand genuinely calls for editorial, heritage, legal, or luxury cues.
- Keep the hero focused: one short headline, one supporting sentence of at most 20 words, and one primary CTA with at most one secondary CTA.
- Keep desktop navigation on one line and keep CTA labels short enough to remain on one line.
- Vary section composition intentionally. Do not repeat the same layout family for consecutive sections.
- Use cards only when they communicate grouping or hierarchy. Do not place every section inside a floating box.
- Use at most one decorative divider for every three sections. Avoid waves, curves, gradients, or glass unless they support the chosen direction.
- Use real supplied imagery when available. If imagery is missing, recommend precise image placements without inventing asset URLs.
- Keep body copy concrete and easy to scan. Avoid filler words such as elevate, unleash, seamless, revolutionary, and next-gen.
- Never invent testimonials, customer names, awards, certifications, statistics, prices, addresses, policies, or availability.
- Never add decorative version labels, section numbers, status dots, scroll instructions, weather strips, or fake product-interface mockups.
- Do not use em dashes or en dashes in generated visitor-facing copy. Use normal punctuation or a hyphen.
- All text, buttons, inputs, overlays, and focus states must meet WCAG AA contrast.
- Motion must communicate hierarchy or feedback, use transform and opacity only, and respect reduced-motion preferences.
`

export const COMPLETE_PAGE_PLANNING_RULES = `
COMPLETE PAGE PLANNING:
- Organize suggestions into one coherent visitor journey instead of one disconnected suggestion per pasted paragraph.
- When supported by the supplied facts, prefer this order: focused hero, primary offer, proof, about or process, FAQ, contact, final CTA.
- A section may be omitted when the source lacks truthful content for it. Report the gap in missingInfoQuestions instead of fabricating filler.
- Reuse or update an existing section when its purpose already exists. Do not create duplicate heroes, contact sections, or CTA sections.
- Keep a single primary conversion goal and use one consistent CTA label for that intent across the page.
- Group related services, products, FAQs, and reviews into structured arrays. Do not split each item into its own section.
- Use concise headings of about eight words or fewer and supporting paragraphs of about 25 words or fewer unless the source requires legal or policy detail.
- Treat SEO metadata, navigation, and social links as supporting settings, not visual page sections.
`
