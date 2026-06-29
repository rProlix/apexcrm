// lib/website/import-engine/prompts/reconstruction.ts
// Gemini Vision prompts for universal design import reconstruction.

import type { DesignImportExtraction } from '@/lib/website/import-engine/types'

export function buildReconstructionPrompt(opts: {
  sourceType: string
  eventSlug: string
  povEnabled: boolean
  extraction: DesignImportExtraction
  userPrompt?: string
  attempt: number
}): string {
  const retryNote = opts.attempt > 1
    ? `RETRY ${opts.attempt}: Prior pass was incomplete. Rebuild FULL native layout — NOT buttons only. Include hero, backgrounds, images, typography, sections, cards, and visual layers.`
    : ''

  return [
    'You are the NexoraNow Universal AI Design Import Engine.',
    'Rebuild the imported design as a native, editable, responsive Invitation/Event website using Website Builder components.',
    retryNote,
    '',
    'CRITICAL RULES:',
    '- NEVER output only buttons/CTAs. Minimum output: hero + at least 2 content sections with visuals.',
    '- Use rendered page images as hero/section backgrounds OR canva_pdf_page_visual layers when PDF.',
    '- Every detected image becomes an editable image component (hero backgroundImage, image_gallery, feature item image).',
    '- Recreate backgrounds: solid colors, gradients, patterns using theme.colors.',
    '- Recreate typography: fonts, sizes, weights, alignment in section content.',
    '- Recreate layout: rows, columns, hero, cards, feature_grid, gallery, FAQ, footer — NOT one flat image.',
    '- Generate desktop/tablet/mobile responsive hints per section.',
    '- Infer animations (fadeUp, softZoomIn, staggerText, imageReveal) — PDF has NO extracted animations.',
    '- Map RSVP → /events/' + opts.eventSlug + '/rsvp',
    '- Map Camera → /events/' + opts.eventSlug + '/camera, Gallery → /events/' + opts.eventSlug + '/gallery',
    '- Preserve Amazon, Target, Registry, Babylist, social, mailto, tel links exactly.',
    '- Do NOT iframe or embed external design tools.',
    '',
    `Source type: ${opts.sourceType}`,
    opts.povEnabled ? 'POV Event Camera: ENABLED' : 'POV: disabled',
    opts.userPrompt ? `User notes: ${opts.userPrompt}` : '',
    '',
    'Extracted text (sample):',
    opts.extraction.text.slice(0, 10000),
    '',
    'Detected links:',
    JSON.stringify(opts.extraction.links.slice(0, 30)),
    '',
    'Available image assets (use these URLs in sections):',
    JSON.stringify(opts.extraction.assets.slice(0, 40).map((a) => ({ id: a.id, kind: a.kind, url: a.publicUrl, page: a.pageNumber }))),
    '',
    'Rendered pages:',
    JSON.stringify(opts.extraction.renderedPages.map((p) => ({ pageNumber: p.pageNumber, url: p.publicUrl, aspectRatio: p.aspectRatio }))),
    '',
    'Return ONLY minified JSON:',
    '{',
    '  "detectedComponentCount": number,',
    '  "theme": { "colors": { "background","text","primary","accent","surface" }, "fonts": { "heading","body" }, "gradients": [] },',
    '  "pages": [{ "title":"Home","slug":"home","sections": [',
    '    { "section_type":"hero|about|feature_grid|image_gallery|cta|rich_text|banner|faq|contact|canva_pdf_page_visual",',
    '      "section_key":"unique", "content": { ... }, "animation": { "preset":"fadeUp|softZoomIn|..." },',
    '      "responsive": { "desktop":{}, "tablet":{}, "mobile":{} } }',
    '  ]}],',
    '  "linkMapping": [{ "label","href","actionType" }],',
    '  "animations": { "globalStyle":"balanced" },',
    '  "eventMetadata": { "eventType","eventDate","location","hosts" },',
    '  "rsvp": { "enabled": boolean, "pageCreated": boolean, "pageTitle": string },',
    '  "warnings": []',
    '}',
  ].filter(Boolean).join('\n')
}
