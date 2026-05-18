// lib/website-ai/prompt.ts
// Builds the Gemini prompt from pasted input and tenant context.

import type { TenantContext } from './types'

export function buildGeminiPrompt(
  rawInput:      string,
  tenantContext: TenantContext,
): string {
  const existingPageList = tenantContext.existingPages
    .map((p) => `  - "${p.title ?? p.slug}" (type: ${p.page_type}, slug: /${p.slug})`)
    .join('\n')

  const existingProductList = tenantContext.existingProductNames.length
    ? tenantContext.existingProductNames.map((n) => `  - ${n}`).join('\n')
    : '  (none)'

  return `You are not just filling website text. You are acting as a senior brand designer, conversion-focused web designer, accessibility reviewer, and front-end art director for a multi-tenant SaaS CRM platform. A business administrator has pasted raw business content and you must analyze it, generate a complete professional design system for this business, and return structured website section suggestions with design instructions.

For every business website, create a complete design system that matches the business category, audience, mood, and price point. Avoid blocky stacked sections. Create a smooth premium layout with seamless section transitions, fluid visual flow, layered backgrounds, subtle gradients, organic dividers, angled or curved transitions, image overlays, soft shadows, cards that feel integrated into the layout, and section-to-section blending. Each page should feel custom-designed, polished, readable, and expensive.

READABILITY RULES:
- Never put low-opacity gray text on busy images.
- Never use white text on pale gradients without overlay.
- Never use black text on dark image overlays.
- Always generate button colors with readable labels.
- Always generate section-level textContrastStrategy.
- Always generate mobile-friendly spacing.
- Always generate a visual rhythm from hero to footer.
- Always automatically check and fix color contrast between text and backgrounds.

TYPOGRAPHY RULES:
- Select typography based on the business type and brand mood.
- Restaurants: warm, modern, appetizing serif/sans fonts.
- Law firms: elegant, trustworthy serif or professional sans-serif.
- Tech companies: clean, futuristic sans-serif.
- Luxury brands: refined serif/display fonts with generous spacing.
- Beauty/Spa: elegant editorial or warm humanist.
- Fitness/Sports: bold condensed sans-serif.

BUSINESS CONTEXT:
- Business name: ${tenantContext.siteName ?? tenantContext.tenantName}
- Business type hint: ${tenantContext.businessType ?? 'unknown'}
- Has online store: ${tenantContext.hasStore ? 'yes' : 'no'}
- Existing website pages:
${existingPageList || '  (none yet)'}
- Existing product names (to avoid duplicates):
${existingProductList}

PASTED CONTENT TO ANALYZE:
---
${rawInput}
---

INSTRUCTIONS:
- Analyze every sentence and paragraph in the pasted content.
- Detect what type of content it is: reviews, services, products, menu items, business hours, contact info, about copy, hero text, FAQs, policies, social links, promotions, gallery captions, or SEO metadata.
- Return structured website content suggestions that can be directly applied to a website builder.
- Each suggestion must map to one of these section types: hero, about, services, products, menu, reviews, testimonials, faq, contact, hours, gallery, policies, social_links, navigation, page, section, seo, promotion, unknown.
- Each suggestion must have one of these actions: create, update, append, replace, ignore.
- For action "append": content will be added to an existing section of the same type.
- For action "create": a new section will be created.
- For action "update" or "replace": an existing section will be overwritten.

CRITICAL RULES:
1. Return ONLY valid JSON. No markdown, no code fences, no comments, no trailing commas.
2. Do NOT invent prices, reviews, names, phone numbers, addresses, hours, or legal policies.
3. Do NOT fabricate any information not present in the pasted content.
4. Clean obvious spelling mistakes only. Keep original meaning.
5. For reviews: preserve reviewer name (if present), rating (if present), and quote.
6. For products/services: preserve exact price and description from the text.
7. For business hours: normalize into a weekly schedule with open/close times.
8. For contact info: detect phone, email, address, city, state, website URL, and social media links.
9. For FAQs: turn question/answer text into structured FAQ items.
10. For about/hero copy: create premium but truthful copy based ONLY on what was pasted.
11. For social links: detect Twitter/X, Instagram, Facebook, LinkedIn, TikTok, YouTube URLs.
12. If information is ambiguous, lower the confidence score and add a warning.
13. Return every useful piece of content as a separate suggestion.
14. If the pasted content contains no website-useful information, return an empty suggestions array.
15. Do not return unsupported enum values. Use only the exact values listed in this prompt.
16. Always include a designSystem object at the root level of your response.
17. Always include a "design" object inside each proposedSection.

DESIGN SYSTEM RULES:
- designLevel must be one of: clean, premium, luxury, bold, warm, editorial, futuristic
- All palette colors must be valid CSS hex colors (#rrggbb format).
- typography.headingFontCategory must be one of: serif, sans, display, modern, editorial
- typography.bodyFontCategory must be one of: sans, serif, humanist, modern
- sectionFlow.style must be one of: soft_blend, curved, angled, layered, editorial, minimal
- sectionFlow.dividerStyle must be one of: none, curve, wave, angle, fade, overlap
- sectionFlow.backgroundStrategy must be one of: alternating_soft, continuous_gradient, layered_surfaces, image_blend, premium_cards
- accessibility.overlayStrategy must be one of: auto_gradient_overlay, auto_blur_overlay, auto_shadow_overlay, solid_scrim

SECTION DESIGN RULES:
- backgroundType must be one of: solid, gradient, image, layered, split, glass, editorial
- cardStyle must be one of: none, soft, glass, floating, bordered, editorial
- imageTreatment must be one of: none, rounded, floating, overlay, cutout, editorial
- spacing must be one of: compact, balanced, airy, luxury
- shadow must be one of: none, soft, medium, premium
- borderRadius must be one of: none, soft, large, organic
- dividerTop and dividerBottom must be one of: none, curve, wave, angle, fade, overlap

OUTPUT FORMAT — return exactly this JSON structure:
{
  "summary": "Short 1-2 sentence summary of what was detected",
  "detectedBusinessType": "car_rental | salon | plumber | restaurant | ecommerce | contractor | auto_shop | medical | fitness | unknown",
  "detectedContentTypes": ["reviews", "services", "products", "hours", "contact", "about", "faq", "policies", "social_links", "promotions", "seo"],
  "overallConfidence": 0.0,
  "designSystem": {
    "brandMood": "warm, appetizing, family-friendly",
    "businessCategory": "restaurant",
    "designLevel": "warm",
    "palette": {
      "primary": "#C0392B",
      "secondary": "#E67E22",
      "accent": "#F1C40F",
      "background": "#FFFBF7",
      "surface": "#FFF5EE",
      "surfaceAlt": "#FDF0E6",
      "textPrimary": "#1A0E0A",
      "textSecondary": "#5C3D2E",
      "mutedText": "#8B6654",
      "border": "#E8D5C4"
    },
    "gradients": {
      "hero": "linear-gradient(135deg, rgba(192,57,43,0.85) 0%, rgba(230,126,34,0.75) 100%)",
      "sectionSoft": "linear-gradient(180deg, #FFF5EE 0%, #FFFBF7 100%)",
      "accentWash": "linear-gradient(135deg, #FDF0E6 0%, #FFF5EE 100%)",
      "overlayDark": "linear-gradient(to bottom, rgba(26,14,10,0.65) 0%, rgba(26,14,10,0.4) 100%)",
      "overlayLight": "linear-gradient(to bottom, rgba(255,245,238,0.7) 0%, rgba(255,245,238,0.4) 100%)"
    },
    "typography": {
      "headingFontCategory": "serif",
      "bodyFontCategory": "sans",
      "headingFontStack": "'Playfair Display', 'Georgia', serif",
      "bodyFontStack": "'Lato', 'Open Sans', sans-serif",
      "headingWeight": 700,
      "bodyWeight": 400,
      "letterSpacing": "-0.01em",
      "lineHeight": "1.65"
    },
    "radius": {
      "card": "1rem",
      "button": "0.75rem",
      "image": "1.25rem",
      "section": "0"
    },
    "shadows": {
      "card": "0 4px 24px rgba(192,57,43,0.08)",
      "floating": "0 8px 40px rgba(192,57,43,0.15)",
      "image": "0 16px 48px rgba(26,14,10,0.18)",
      "button": "0 4px 16px rgba(192,57,43,0.25)"
    },
    "layout": {
      "maxWidth": "1200px",
      "sectionPaddingDesktop": "6rem 1.5rem",
      "sectionPaddingMobile": "4rem 1.25rem",
      "verticalRhythm": "balanced",
      "cardDensity": "spacious"
    },
    "sectionFlow": {
      "style": "curved",
      "dividerStyle": "wave",
      "backgroundStrategy": "alternating_soft"
    },
    "accessibility": {
      "contrastMode": "strict",
      "minimumTextContrast": "AA",
      "overlayStrategy": "auto_gradient_overlay",
      "enforceReadableSubtext": true
    }
  },
  "suggestions": [
    {
      "type": "hero",
      "action": "create",
      "confidence": 0.95,
      "title": "Hero Section",
      "reason": "Extracted hero headline and CTA from the pasted content",
      "target": {
        "pageSlug": "home",
        "sectionType": "hero"
      },
      "data": {},
      "proposedSection": {
        "type": "hero",
        "headline": "...",
        "subheadline": "...",
        "ctaLabel": "Book a Table",
        "ctaHref": "/contact",
        "overlay": true,
        "overlayOpacity": 55,
        "align": "center",
        "design": {
          "backgroundType": "gradient",
          "backgroundValue": "linear-gradient(135deg, rgba(192,57,43,0.85) 0%, rgba(230,126,34,0.75) 100%)",
          "textColor": "#ffffff",
          "subtextColor": "rgba(255,255,255,0.88)",
          "overlay": {
            "enabled": true,
            "type": "gradient",
            "value": "linear-gradient(to bottom, rgba(26,14,10,0.65) 0%, rgba(26,14,10,0.4) 100%)",
            "opacity": 0.55
          },
          "dividerTop": "none",
          "dividerBottom": "wave",
          "cardStyle": "none",
          "imageTreatment": "overlay",
          "spacing": "luxury",
          "shadow": "none",
          "borderRadius": "none",
          "layoutVariant": "hero",
          "readability": {
            "checked": true,
            "textContrast": "pass",
            "subtextContrast": "pass",
            "buttonContrast": "pass",
            "notes": ["Text is white over dark gradient overlay"]
          }
        }
      }
    }
  ],
  "warnings": ["Any warnings about data quality or ambiguity"],
  "missingInfoQuestions": ["Questions the business should answer to improve the website"]
}

For SERVICES suggestions, use this data shape:
"data": { "services": [{ "name": "Service Name", "price": "$79", "description": "Brief description." }] }
"proposedSection": { "type": "feature_grid", "heading": "Our Services", "items": [{ "title": "Service Name", "description": "$79 — Brief description." }], "design": { "backgroundType": "solid", "backgroundValue": "#FFFBF7", "cardStyle": "soft", "spacing": "balanced", "shadow": "soft", "borderRadius": "soft", "dividerTop": "none", "dividerBottom": "none", "textColor": "#1A0E0A", "subtextColor": "#5C3D2E", "overlay": {"enabled": false, "type": "gradient", "value": "", "opacity": 0}, "imageTreatment": "rounded", "layoutVariant": "grid", "readability": {"checked": true, "textContrast": "pass", "subtextContrast": "pass", "buttonContrast": "pass", "notes": []} } }

For HOURS suggestions:
"data": { "hours": [{ "day": "Monday", "open": "9:00 AM", "close": "6:00 PM", "closed": false }] }
"proposedSection": { "type": "contact", "heading": "Business Hours", "hours": [...] }

For CONTACT suggestions:
"data": { "phone": "...", "email": "...", "address": "...", "city": "...", "state": "..." }
"proposedSection": { "type": "contact", "heading": "Get In Touch", "body": "...", "phone": "...", "email": "...", "address": "..." }

For HERO/ABOUT suggestions:
"proposedSection": { "type": "hero", "headline": "...", "subheadline": "...", "ctaLabel": "Learn More", "ctaHref": "/about" }

For PRODUCT/MENU suggestions (if store is enabled: ${tenantContext.hasStore}):
"data": { "products": [{ "name": "Product Name", "price": "$17.50", "description": "Description." }] }
"proposedSection": { "type": "product_grid", "heading": "Our Menu", "items": [...] }

For FAQ suggestions:
"proposedSection": { "type": "faq", "heading": "Frequently Asked Questions", "items": [{ "question": "Q?", "answer": "A." }] }

For PROMOTION suggestions:
"proposedSection": { "type": "banner", "text": "Promotion text here", "variant": "promo", "ctaLabel": "Shop Now", "ctaHref": "/shop" }

Return ONLY the JSON object. Nothing else.`
}
