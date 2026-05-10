// lib/ai/websiteImagePrompts.ts
// Builds Gemini planning prompts and Imagen generation prompts.
// SERVER-ONLY — never import in client components.

import type { ImagePlannerContext } from './websiteImageTypes'

// ── Gemini planning prompt ────────────────────────────────────────────────────

export function buildImagePlannerPrompt(ctx: ImagePlannerContext): string {
  // Determine the effective business category with fallback priority:
  // 1. businessCategory (from tenant.metadata)
  // 2. autofillBusinessType (detected by Gemini autofill)
  // 3. businessType (legacy field)
  // 4. "general"
  const effectiveType = ctx.businessCategory ?? ctx.autofillBusinessType ?? ctx.businessType ?? 'general'

  // Build sections summary with FULL content context
  const sectionsSummary = (ctx.sectionDetails ?? ctx.sections).map(s => {
    // Check if this is a RichSectionDetail (has headline/body/items/ctaText)
    const maybeRich = s as {
      section_type: string; id: string; page_id: string;
      headline?: string; body?: string; items?: string[]; ctaText?: string;
      content?: Record<string, unknown>
    }
    if (typeof maybeRich.headline === 'string') {
      const itemsSample = (maybeRich.items ?? []).slice(0, 3).join(', ')
      return [
        `  - section_type: ${maybeRich.section_type}, id: ${maybeRich.id}, page_id: ${maybeRich.page_id}`,
        `    headline: "${(maybeRich.headline ?? '').slice(0, 80)}"`,
        maybeRich.body     ? `    body: "${maybeRich.body.slice(0, 100)}"` : '',
        itemsSample        ? `    items: [${itemsSample}]` : '',
        maybeRich.ctaText  ? `    cta: "${maybeRich.ctaText}"` : '',
      ].filter(Boolean).join('\n')
    }
    // Fallback: legacy shape
    const legacySection = s as { section_type: string; id: string; page_id: string; content: Record<string, unknown> }
    const c = legacySection.content ?? {}
    const heading = String(c?.heading ?? c?.headline ?? c?.title ?? '')
    return `  - section_type: ${legacySection.section_type}, id: ${legacySection.id}, heading: "${heading.slice(0,60)}"`
  }).join('\n')

  const pagesSummary = ctx.pages.map(p =>
    `  - page_type: ${p.page_type}, slug: /${p.slug}, title: "${p.title ?? ''}"`
  ).join('\n')

  // Business description block
  const businessDescBlock = [
    ctx.businessDescription
      ? `- Business description: "${ctx.businessDescription}"` : '',
    ctx.autofillSummary
      ? `- AI-detected content summary: "${ctx.autofillSummary}"` : '',
  ].filter(Boolean).join('\n')

  // Services block
  const servicesBlock = (ctx.services ?? []).length > 0
    ? (ctx.services ?? []).map(s =>
        `  - ${s.name}${s.price ? ` (${s.price})` : ''}${s.description ? `: ${s.description.slice(0, 80)}` : ''}`
      ).join('\n')
    : '  (none listed)'

  // Products block
  const productsBlock = (ctx.topProducts ?? []).length > 0
    ? (ctx.topProducts ?? []).map(p =>
        `  - ${p.name}${p.price ? ` ($${p.price})` : ''}${p.description ? `: ${p.description.slice(0, 60)}` : ''}`
      ).join('\n')
    : '  (none)'

  // Reviews block — use real customer language to ground the visuals
  const reviewsBlock = (ctx.reviews ?? []).length > 0
    ? (ctx.reviews ?? []).slice(0, 3).map(r =>
        `  - "${r.text.slice(0, 100)}" — ${r.author}`
      ).join('\n')
    : '  (none available)'

  const hasExistingImages = ctx.existingImageUrls.length > 0

  return `You are an expert website visual strategist and Imagen 4 Ultra prompt engineer.
Your task: analyze this SPECIFIC business and its website, then return a JSON image plan
with prompts that are GROUNDED IN THE ACTUAL BUSINESS — not generic stock imagery.

## THE BUSINESS

- Business name: "${ctx.tenantName}"
- Business type / industry: ${effectiveType}
${businessDescBlock}
${ctx.siteTagline ? `- Tagline: "${ctx.siteTagline}"` : ''}
${ctx.colorPalette ? `- Brand colors: ${ctx.colorPalette}` : ''}
- Has ecommerce / online store: ${ctx.hasStore ? 'yes' : 'no'}
- Active product count: ${ctx.productCount}
- Has existing site images: ${hasExistingImages ? 'yes' : 'no'}

## SERVICES OFFERED

${servicesBlock}

## PRODUCTS (if any)

${productsBlock}

## REAL CUSTOMER REVIEWS (use for tone/subject grounding)

${reviewsBlock}

## WEBSITE PAGES

${pagesSummary || '  (no pages yet)'}

## WEBSITE SECTIONS (with actual content)

${sectionsSummary || '  (no sections yet)'}

## CRITICAL RULES

1. Return ONLY valid JSON — no markdown, no code fences, no comments.
2. Every image prompt MUST mention the actual business type and industry — NO generic imagery.
3. For a RESTAURANT: use that restaurant's cuisine, dishes, ambiance, and menu items in the prompt.
4. For a BEAUTY SALON: use that salon's services (lashes, facials, brows, etc.) in the prompt.
5. For an AUTO SHOP / DETAILING: use that business's specific services (paint correction, ceramic coat, etc.).
6. For a CONTRACTOR / TRADESPERSON: use the specific trade (roofing, plumbing, HVAC, etc.).
7. For ECOMMERCE: use the actual products sold in the prompt.
8. If you see customer reviews mentioning specific products/services, REFERENCE THEM in the prompt.
9. If you see section headlines, USE THEM to guide what the image should show.
10. Use aspect_ratio appropriate for section: 16:9 for hero/banners, 4:3 for cards, 3:2 for feature images.
11. Keep priority between 1 (most important) and 100 (optional). Hero images = 1-10.
12. Only plan images for section types that exist in the sections list above.
13. Never generate fake headshots, celebrity imagery, or logos.
14. Never fabricate medical/legal claims in prompts.
15. Prompts must be rich, photorealistic, commercial, and website-ready.
16. Hero images should feel like premium advertising photography for THIS specific business.
17. About section images: show the business workspace, team environment, or founder story.
18. Contact section images: show the storefront, office front, or welcoming entrance.
19. Testimonials: use abstract warm backgrounds, NOT stock people photos.
20. FAQ sections: soft decorative imagery only.
21. use_existing_if_avail should be true for product images if the store has products.

## GROUNDING EXAMPLES (follow this specificity level)

For a vegan Vietnamese restaurant with pho on the menu:
  prompt: "Professional commercial food photography of steaming vegan Vietnamese pho, clear broth with rice noodles, fresh herbs, bean sprouts, lime wedge, chopsticks on clean wooden surface, warm natural lighting, bokeh background, premium restaurant menu photography"

For an auto detailing business specializing in ceramic coating:
  prompt: "Premium automotive photography of a luxury black car with a mirror-like ceramic coating finish, detail technician applying product in a clean professional detail bay, dramatic studio lighting highlighting the deep reflective shine, commercial photography"

For a hair salon specializing in color and styling:
  prompt: "Bright modern hair salon interior, stylish cutting station with gold mirrors, fresh flowers, professional colorist with client in foreground, warm lifestyle photography, salon atmosphere, shallow depth of field"

## REQUIRED JSON OUTPUT SHAPE

{
  "plans": [
    {
      "placement_key": "home_hero_main",
      "section_type": "hero",
      "image_role": "hero_main",
      "title": "Hero Main Image",
      "reason": "The hero image is the first visual visitors see. It must immediately show WHAT THIS BUSINESS offers.",
      "business_goal": "Convert visitors by showing the premium quality and specific offering of this business.",
      "image_description": "One-sentence description of exactly what the image will show, grounded in this business.",
      "visual_style": "Commercial photography style descriptor.",
      "prompt": "Highly specific Imagen prompt grounded in this actual business, services, and content.",
      "negative_prompt": "text, watermark, logo, blurry, distorted, unrelated industries",
      "aspect_ratio": "16:9",
      "priority": 1,
      "use_existing_if_avail": false
    }
  ],
  "warnings": []
}

Return only the JSON. No other text.`
}

// ── Imagen prompt enhancer ────────────────────────────────────────────────────

/**
 * Takes a planner prompt string and enhances it with quality booster suffixes
 * appropriate for the Imagen 4 Ultra model and the specific business type.
 */
export function enhancePromptForImagen(
  basePrompt: string,
  imageRole: string,
  businessType: string | null,
): string {
  const roleModifiers: Record<string, string> = {
    hero_main:              'ultra-sharp commercial photography, premium website hero image, 8K resolution, highly detailed',
    hero_background:        'wide angle composition, soft natural background, website hero background, minimal noise, high resolution',
    about_feature:          'warm authentic lifestyle photography, brand storytelling, genuine atmosphere',
    service_card:           'clean commercial photography, sharp focus, professional presentation, white or neutral background',
    gallery_cover:          'editorial photography, polished, premium commercial quality',
    gallery_item:           'clean high quality photograph, natural lighting, sharp focus',
    product_banner:         'commercial product photography, studio lighting, premium presentation, high resolution',
    category_banner:        'wide banner composition, 16:9, vibrant, commercial photography',
    contact_banner:         'welcoming warm tone, location or lifestyle imagery, inviting atmosphere',
    testimonial_background: 'abstract soft background, subtle texture, pastel gradient, no people, clean minimalist',
    rewards_promo_banner:   'vibrant energetic promotional banner, bold colors, commercial quality',
    cta_banner:             'conversion-focused composition, clean layout, bold visual impact',
    promo_banner:           'promotional eye-catching design, commercial quality photography',
    feature_image:          'clean high quality commercial photography, website-ready',
    section_background:     'subtle texture or abstract gradient, not distracting, professional',
    other:                  'commercial photography, website-ready, high quality, professional',
  }

  const modifier = roleModifiers[imageRole] ?? roleModifiers.other

  // Business-type specific photography style modifiers
  const businessModifiers: Record<string, string> = {
    restaurant:  'food photography, natural warm lighting, restaurant atmosphere, appetizing presentation',
    car_rental:  'automotive photography, clean studio environment, premium vehicle presentation',
    auto_shop:   'automotive photography, professional detail bay, premium vehicle, clean garage environment',
    salon:       'beauty photography, warm inviting salon atmosphere, soft elegant lighting',
    fitness:     'fitness lifestyle photography, energetic action, motivational atmosphere',
    contractor:  'professional trade photography, skilled craftwork, trustworthy presentation',
    plumber:     'professional service photography, skilled technician, trustworthy brand feel',
    medical:     'clean clinical environment, professional medical setting, trustworthy calm atmosphere',
    ecommerce:   'commercial product photography, clean studio, premium presentation',
    unknown:     'professional business photography, clean modern environment',
  }

  const normalizedType = (businessType ?? 'unknown')
    .toLowerCase()
    .replace(/[^a-z_]/g, '_')
    .replace(/__+/g, '_')

  const btModifier = businessModifiers[normalizedType] ?? businessModifiers.unknown

  // Always add a guardrail to prevent unrelated imagery
  const guardrail = `Do not depict unrelated industries, random generic office scenes, or stock photo clichés.`

  return [basePrompt, modifier, btModifier, guardrail].filter(Boolean).join(', ')
}
