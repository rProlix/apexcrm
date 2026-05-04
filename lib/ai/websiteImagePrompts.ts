// lib/ai/websiteImagePrompts.ts
// Builds Gemini planning prompts and Imagen generation prompts.
// SERVER-ONLY — never import in client components.

import type { ImagePlannerContext } from './websiteImageTypes'

// ── Gemini planning prompt ────────────────────────────────────────────────────

export function buildImagePlannerPrompt(ctx: ImagePlannerContext): string {
  const sectionsSummary = ctx.sections.map(s => {
    const c = s.content as Record<string, unknown>
    const heading = (c.heading ?? c.title ?? '') as string
    return `  - section_type: ${s.section_type}, id: ${s.id}, page_id: ${s.page_id}, heading: "${heading.slice(0,60)}"`
  }).join('\n')

  const pagesSummary = ctx.pages.map(p =>
    `  - page_type: ${p.page_type}, slug: ${p.slug}, id: ${p.id}, title: "${p.title ?? ''}"`
  ).join('\n')

  const hasExistingImages = ctx.existingImageUrls.length > 0

  return `You are an expert website visual strategist for a ${ctx.businessType ?? 'business'} called "${ctx.tenantName}".

Your task: analyze the website structure and decide EXACTLY which images are needed, why, and how they should look.

## Website Structure

Pages:
${pagesSummary || '  (no pages yet)'}

Sections:
${sectionsSummary || '  (no sections yet)'}

## Business Context

- Business name: ${ctx.tenantName}
- Business type: ${ctx.businessType ?? 'general'}
- Has ecommerce/store: ${ctx.hasStore ? 'yes' : 'no'}
- Existing products with images: ${ctx.productCount}
- Has existing site images: ${hasExistingImages ? 'yes' : 'no'}
${ctx.siteTagline ? `- Site tagline: "${ctx.siteTagline}"` : ''}
${ctx.colorPalette ? `- Brand color palette: ${ctx.colorPalette}` : ''}

## Rules

1. Return ONLY valid JSON — no markdown, no code fences, no comments.
2. Plan only images that will genuinely improve the site. Do not over-generate.
3. For each section that BENEFITS from an image, create one plan item.
4. Never plan fake headshots for reviewer testimonials — use abstract/illustrative imagery only if needed.
5. Never plan logos. Never plan celebrity imagery.
6. Never fabricate medical/legal claims in prompts.
7. Prompts must be rich, commercial, and website-ready.
8. Use aspect_ratio appropriate for section: 16:9 for hero/banners, 4:3 or 1:1 for cards, 3:2 for feature images.
9. Keep priority between 1 (most important) and 100 (optional). Hero images = 1-10.
10. If the business type is car_rental, plan: hero fleet/vehicle image, service visuals, CTA banner.
    If salon, plan: hero atmosphere, before/after area, services images.
    If restaurant, plan: hero dish/atmosphere, menu category images.
    If ecommerce, plan: collection hero, category banners.
    If plumber/contractor, plan: hero service image, trust/reliability visuals, CTA.
    If fitness, plan: hero action image, services/classes visuals.
    Adapt intelligently to any business type.
11. Only plan images for section types that exist in the sections list above.
12. use_existing_if_avail should be true for product images if has_store is true and productCount > 0.

## Required JSON output shape

{
  "plans": [
    {
      "placement_key": "home_hero_main",
      "section_type": "hero",
      "image_role": "hero_main",
      "title": "Hero Main Image",
      "reason": "The hero image is the first visual a visitor sees. It must immediately communicate what the business offers and build visual trust.",
      "business_goal": "Increase engagement and reduce bounce rate by showing a premium, inviting visual.",
      "image_description": "A beautifully lit interior of a modern luxury beauty salon with clean styling stations and warm ambient lighting.",
      "visual_style": "Commercial photography, soft warm lighting, shallow depth of field, premium and inviting.",
      "prompt": "Ultra-clean commercial photography of a modern luxury beauty salon interior, warm ambient lighting, elegant styling stations, marble surfaces, gold accents, shallow depth of field, lifestyle photography, 8K, highly detailed, professional website hero image",
      "negative_prompt": "text, watermark, people, logo, cartoon, illustration, blurry, dark",
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
 * appropriate for the Imagen 4 Ultra model.
 */
export function enhancePromptForImagen(
  basePrompt: string,
  imageRole: string,
  businessType: string | null,
): string {
  const roleModifiers: Record<string, string> = {
    hero_main:              'ultra-sharp, commercial photography, premium website hero image, 8K',
    hero_background:        'wide angle, soft background, website background image, minimal noise',
    about_feature:          'warm lifestyle photography, authentic, brand storytelling',
    service_card:           'clean white background, commercial product/service photography, sharp focus',
    gallery_cover:          'editorial photography, polished, premium',
    gallery_item:           'clean, high quality photograph, natural lighting',
    product_banner:         'commercial product photography, studio lighting, premium presentation',
    category_banner:        'wide banner composition, 16:9, vibrant, commercial',
    contact_banner:         'welcoming, warm tone, location or lifestyle imagery',
    testimonial_background: 'abstract soft background, pastel gradient, no people, clean minimalist',
    rewards_promo_banner:   'vibrant, energetic, promotional banner composition, bold colors',
    cta_banner:             'conversion-focused, action-oriented, clean layout, bold visual',
    promo_banner:           'promotional, eye-catching, commercial quality',
    feature_image:          'clean, high quality, website-ready',
    section_background:     'subtle texture, pattern, or abstract gradient, not distracting',
    other:                  'commercial photography, website-ready, high quality',
  }

  const modifier = roleModifiers[imageRole] ?? roleModifiers.other

  const btModifier = businessType === 'restaurant'
    ? 'food photography, natural lighting, restaurant atmosphere'
    : businessType === 'car_rental'
    ? 'automotive photography, clean environment, premium vehicle'
    : businessType === 'salon'
    ? 'beauty photography, warm salon atmosphere'
    : businessType === 'fitness'
    ? 'fitness lifestyle photography, energetic, motivational'
    : ''

  return [basePrompt, modifier, btModifier].filter(Boolean).join(', ')
}
