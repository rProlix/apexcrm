// lib/website/ai/buildRestylePrompt.ts
// Builds the Gemini prompt for the AI Restyle Website feature.
// The prompt instructs Gemini to redesign the visual presentation of an existing
// website while preserving all content, sections, and business data.

import type { RestyleSectionContext, RestyleBusinessContext, RestyleIntensity } from './restyleTypes'

export interface BuildRestylePromptOptions {
  business: RestyleBusinessContext
  sections: RestyleSectionContext[]
  stylePreset: string
  customPrompt: string | null | undefined
  intensity: RestyleIntensity
  preserveImages: boolean
  generateImageSuggestions: boolean
  applyAnimations: boolean
  mobileFirst: boolean
}

const STYLE_PRESET_DESCRIPTIONS: Record<string, string> = {
  premium_modern:   'Clean, minimal, high-contrast. Geometric precision, bold typography, white space, subtle shadows, refined micro-details.',
  luxury_editorial: 'Ultra-high-end editorial magazine aesthetic. Oversized type, dramatic full-bleed imagery, slow elegant transitions, quiet luxury.',
  warm_restaurant:  'Warm, inviting, appetite-stimulating. Rich earthy tones, cinematic food photography overlays, curved sections, candlelit warmth.',
  clean_saas:       'Crisp SaaS product aesthetic. Blue-tinted neutrals, feature grids, conversion-focused layouts, trust signals, data visualization.',
  bold_automotive:  'Powerful, precision-engineered. Dark surfaces, metallic accents, angular dividers, full-bleed vehicle imagery, motion energy.',
  calm_medical:     'Trustworthy, clean, reassuring. Soft blues and greens, professional typography, ample white space, easy navigation, WCAG AA+.',
  elegant_law_firm: 'Authoritative, dignified, trustworthy. Classic serif typography, deep navy or charcoal, gold accents, editorial layout, no gimmicks.',
  beauty_spa:       'Luxurious, calming, feminine. Blush and gold tones, organic rounded shapes, soft gradients, editorial photography treatment.',
  dark_premium:     'Dark mode premium. Deep charcoal backgrounds, glowing accents, premium card surfaces, subtle light effects, modern and sophisticated.',
  bright_friendly:  'Energetic, accessible, approachable. Bright clean colors, friendly rounded elements, bold CTAs, welcoming layout, mobile-first.',
  custom:           'Custom style direction provided by the user.',
}

export function buildRestylePrompt(opts: BuildRestylePromptOptions): string {
  const {
    business, sections, stylePreset, customPrompt, intensity,
    preserveImages, generateImageSuggestions, applyAnimations, mobileFirst,
  } = opts

  const presetDescription = STYLE_PRESET_DESCRIPTIONS[stylePreset] ?? stylePreset

  const sectionList = sections.map((s, i) =>
    `  { "id": "${s.id}", "type": "${s.type}", "title": "${s.title ?? s.type}", "sortOrder": ${s.sortOrder}, "pageId": "${s.pageId}" }`
  ).join(',\n')

  const intensityGuide = {
    subtle:    'Subtle — minimal visual changes. Refine colors slightly, improve readability, tighten spacing. No dramatic background changes.',
    balanced:  'Balanced — meaningful visual improvements. Update colors, backgrounds, dividers, card styles. Keep the site recognizable but clearly improved.',
    cinematic: 'Cinematic — dramatic premium redesign. Full color palette transformation, cinematic backgrounds, dramatic overlays, premium section transitions.',
  }[intensity]

  const mobilePriority = mobileFirst
    ? 'MOBILE FIRST: Section padding, typography, and layouts must be optimized for mobile viewing. Every fix must include mobile-specific spacing values.'
    : 'Standard responsive design. Apply reasonable mobile spacing.'

  return `You are a premium website art director and visual designer. You are redesigning the VISUAL APPEARANCE of an existing business website.

CRITICAL RULES — DO NOT VIOLATE:
1. DO NOT remove any sections.
2. DO NOT delete or change existing text content, reviews, products, FAQs, services, contact info, or business data.
3. DO NOT add fake content. DO NOT invent business facts.
4. ONLY redesign the visual presentation: colors, backgrounds, typography, spacing, dividers, overlays, card styles, shadows, and image treatments.
5. preserveContent is ALWAYS true.
6. Return ONLY valid JSON. No markdown code fences. No prose. No comments outside JSON.

BUSINESS CONTEXT:
- Name: ${business.businessName}
- Type / Category: ${business.businessType} / ${business.businessCategory}
- Description: ${business.description || 'Not provided'}

STYLE DIRECTION: ${stylePreset.toUpperCase()}
${presetDescription}${customPrompt ? `\n\nCUSTOM PROMPT FROM BUSINESS:\n${customPrompt}` : ''}

REDESIGN INTENSITY: ${intensity.toUpperCase()}
${intensityGuide}

${mobilePriority}

EXISTING WEBSITE SECTIONS (${sections.length} total — all must be preserved):
[
${sectionList || '  (no sections yet)'}
]

DESIGN SYSTEM REQUIREMENTS:
Create a complete design system that matches the style direction and business category.
The design system must drive all section designs via shared tokens (CSS vars).

SECTION VISUAL DESIGN REQUIREMENTS:
For each section, provide a complete SectionDesign object.
Each section should have a distinct but harmonious visual treatment.
Do NOT make every section look like a flat white box.

MANDATORY PREMIUM DESIGN RULES:
"The redesigned website must not look like stacked square blocks. Use smooth transitions between sections, layered backgrounds, gradient washes, soft visual blending, curved or angled dividers, premium spacing, image overlays, shadows, and organic layout flow."

READABILITY RULES:
"All text, especially subtext, buttons, cards, and text over images, must pass WCAG AA readability checks. If the background is an image, gradient, or busy surface, include overlay, blur, scrim, or text shadow instructions in the design."

SECTION ID RULES:
- sectionId MUST be one of the exact UUID values from the sections list above, OR null.
- Do NOT invent sectionId values.
- If you use null, also include sectionType and title so the backend can match by type.

ENUM RULES — ONLY USE THESE VALUES:
- backgroundType: "solid" | "gradient" | "image" | "layered" | "split" | "glass" | "editorial"
- cardStyle: "none" | "soft" | "glass" | "floating" | "bordered" | "editorial"
- imageTreatment: "none" | "rounded" | "floating" | "overlay" | "cutout" | "editorial"
- spacing: "compact" | "balanced" | "airy" | "luxury"
- shadow: "none" | "soft" | "medium" | "premium"
- borderRadius: "none" | "soft" | "large" | "organic"
- dividerTop / dividerBottom: "none" | "curve" | "wave" | "angle" | "fade" | "overlap"
- overlay.type: "gradient" | "blur" | "scrim" | "shadow"
- designLevel: "clean" | "premium" | "luxury" | "bold" | "warm" | "editorial" | "futuristic"
- sectionFlow.style: "soft_blend" | "curved" | "angled" | "layered" | "editorial" | "minimal"
- sectionFlow.backgroundStrategy: "alternating_soft" | "continuous_gradient" | "layered_surfaces" | "image_blend" | "premium_cards"
- intensity (animations): "subtle" | "balanced" | "cinematic"
${applyAnimations ? `- animation targetType: "page" | "section" | "component" ONLY` : ''}

COLOR RULES:
- All colors must be valid CSS hex codes (e.g. #1a1a2e, #c9a84c, rgba(0,0,0,0.6) is acceptable for overlays)
- backgroundValue can be a hex color, CSS linear-gradient(), or radial-gradient()
- textColor and subtextColor should be hex or rgba

Return a JSON object matching EXACTLY this schema:
{
  "summary": "2-3 sentence description of the redesign direction and key visual changes",
  "designSystem": {
    "brandMood": "string describing the mood",
    "businessCategory": "${business.businessCategory}",
    "designLevel": "premium",
    "palette": {
      "primary": "#hex",
      "secondary": "#hex",
      "accent": "#hex",
      "background": "#hex",
      "surface": "#hex",
      "surfaceAlt": "#hex",
      "textPrimary": "#hex",
      "textSecondary": "#hex",
      "mutedText": "#hex",
      "border": "#hex"
    },
    "gradients": {
      "hero": "linear-gradient(...)",
      "sectionSoft": "linear-gradient(...)",
      "accentWash": "linear-gradient(...)",
      "overlayDark": "linear-gradient(...)",
      "overlayLight": "linear-gradient(...)"
    },
    "typography": {
      "headingFontCategory": "serif|sans|display|modern|editorial",
      "bodyFontCategory": "sans|serif|humanist|modern",
      "headingFontStack": "\"Font Name\", fallback, sans-serif",
      "bodyFontStack": "\"Font Name\", fallback, sans-serif",
      "headingWeight": 700,
      "bodyWeight": 400,
      "letterSpacing": "-0.02em",
      "lineHeight": "1.6"
    },
    "radius": {
      "card": "12px",
      "button": "8px",
      "image": "12px",
      "section": "0px"
    },
    "shadows": {
      "card": "0 4px 24px rgba(0,0,0,0.08)",
      "floating": "0 8px 40px rgba(0,0,0,0.15)",
      "image": "0 8px 32px rgba(0,0,0,0.12)",
      "button": "0 2px 8px rgba(0,0,0,0.15)"
    },
    "layout": {
      "maxWidth": "1280px",
      "sectionPaddingDesktop": "5rem 2rem",
      "sectionPaddingMobile": "3rem 1.25rem",
      "verticalRhythm": "balanced",
      "cardDensity": "balanced"
    },
    "sectionFlow": {
      "style": "soft_blend",
      "dividerStyle": "curve",
      "backgroundStrategy": "alternating_soft"
    },
    "accessibility": {
      "contrastMode": "strict",
      "minimumTextContrast": "AA",
      "overlayStrategy": "auto_gradient_overlay",
      "enforceReadableSubtext": true
    }
  },
  "pageUpgrades": [
    {
      "pageId": "uuid-of-page",
      "pageSlug": "/",
      "layoutMood": "description of the page mood",
      "backgroundStrategy": "alternating_soft",
      "sectionFlow": "soft_blend"
    }
  ],
  "sectionUpgrades": [
    {
      "sectionId": "<EXACT UUID or null>",
      "sectionType": "hero",
      "title": "section title or null",
      "design": {
        "backgroundType": "gradient",
        "backgroundValue": "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
        "textColor": "#ffffff",
        "subtextColor": "rgba(255,255,255,0.82)",
        "overlay": {
          "enabled": false,
          "type": "gradient",
          "value": "",
          "opacity": 0
        },
        "dividerTop": "none",
        "dividerBottom": "curve",
        "cardStyle": "none",
        "imageTreatment": "overlay",
        "spacing": "luxury",
        "shadow": "none",
        "borderRadius": "none",
        "layoutVariant": "centered",
        "readability": {
          "checked": true,
          "textContrast": "pass",
          "subtextContrast": "pass",
          "buttonContrast": "pass",
          "notes": []
        }
      },
      "layoutVariant": "centered",
      "visualIntent": "Dramatic hero entrance with gradient background",
      "preserveContent": true
    }
  ],
  "contrastFixes": [
    {
      "sectionId": "<uuid or null>",
      "sectionType": "hero",
      "field": "textColor",
      "issue": "describe the contrast issue",
      "fix": "describe the fix applied"
    }
  ],
  "mobileFixes": [
    {
      "sectionId": "<uuid or null>",
      "sectionType": "hero",
      "issue": "describe mobile issue",
      "fix": "describe mobile fix"
    }
  ],
  "warnings": ["any important warnings about this restyle"],${applyAnimations ? `
  "animationPlan": {
    "globalMotionStyle": "description of animation approach",
    "reducedMotionRespected": true,
    "animations": [
      {
        "targetType": "section",
        "sectionId": "<EXACT UUID or null>",
        "targetKey": "hero",
        "preset": "fade_up",
        "intensity": "${intensity}",
        "durationMs": 700,
        "delayMs": 0,
        "easing": "smooth",
        "mobileEnabled": true,
        "reason": "why this animation is appropriate"
      }
    ]
  },` : ''}${generateImageSuggestions && !preserveImages ? `
  "imageSuggestions": [
    {
      "sectionId": "<uuid or null>",
      "sectionType": "hero",
      "slotKey": "primary",
      "prompt": "detailed AI image generation prompt",
      "style": "photorealistic|illustration|abstract",
      "aspectRatio": "16:9",
      "notes": "why this image would enhance this section"
    }
  ]` : ''}
}

REMINDER:
- sectionUpgrades must cover ALL ${sections.length} sections listed above.
- Every sectionId must be an exact UUID from the sections list or null.
- Return ONLY the JSON object above. No markdown. No backticks. No extra text.`
}
