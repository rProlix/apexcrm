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

  return `You are a website content assistant for a multi-tenant SaaS CRM platform. A business administrator has pasted raw business content and you must analyze it, detect what type of content it is, and return structured website section suggestions.

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

OUTPUT FORMAT — return exactly this JSON structure:
{
  "summary": "Short 1-2 sentence summary of what was detected",
  "detectedBusinessType": "car_rental | salon | plumber | restaurant | ecommerce | contractor | auto_shop | medical | fitness | unknown",
  "detectedContentTypes": ["reviews", "services", "products", "hours", "contact", "about", "faq", "policies", "social_links", "promotions", "seo"],
  "overallConfidence": 0.0,
  "suggestions": [
    {
      "type": "reviews",
      "action": "append",
      "confidence": 0.95,
      "title": "Customer Reviews",
      "reason": "Explanation of why this was detected",
      "target": {
        "pageSlug": "home",
        "sectionType": "testimonials"
      },
      "data": {
        "reviews": [
          {
            "name": "Reviewer Name",
            "rating": 5,
            "quote": "The review text.",
            "source": "pasted_text"
          }
        ]
      },
      "proposedSection": {
        "type": "testimonials",
        "heading": "What Our Customers Say",
        "subheading": "Real feedback from our customers.",
        "items": [
          {
            "name": "Reviewer Name",
            "rating": 5,
            "text": "The review text."
          }
        ]
      }
    }
  ],
  "warnings": ["Any warnings about data quality or ambiguity"],
  "missingInfoQuestions": ["Questions the business should answer to improve the website"]
}

For SERVICES suggestions, use this data shape:
"data": { "services": [{ "name": "Service Name", "price": "$79", "description": "Brief description." }] }
"proposedSection": { "type": "feature_grid", "heading": "Our Services", "items": [{ "title": "Service Name", "description": "$79 — Brief description." }] }

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
