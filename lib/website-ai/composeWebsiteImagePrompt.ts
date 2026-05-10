// lib/website-ai/composeWebsiteImagePrompt.ts
// SERVER-ONLY — converts a SectionImageBrief into a high-quality Imagen 4 prompt.
//
// Rules:
// - Always includes the exact business type and section purpose
// - Folds negative guidance into the positive prompt (Imagen 4 removed negativePrompt)
// - Grounds every prompt in the specific business
// - Avoids generic stock-photo language
// - Returns both the composed prompt and alt text

import type { SectionImageBrief } from './createSectionImageBrief'
import type { RichImageContext } from './buildWebsiteImageContext'

export interface ComposedImagePrompt {
  prompt:      string
  altText:     string
  aspectRatio: string
  reasoning:   string
}

export function composeWebsiteImagePrompt(
  brief: SectionImageBrief,
  ctx:   RichImageContext,
): ComposedImagePrompt {
  const businessName = ctx.tenantName
  const businessType = brief.businessType.replace(/_/g, ' ')

  // Build the core subject statement
  const subjectStatement = buildSubjectStatement(brief, ctx)

  // Build the environment / setting
  const environmentStatement = brief.environment
    ? `Set in: ${brief.environment}.`
    : ''

  // Build visual style
  const styleStatement = [
    brief.styling,
    brief.lighting ? `Lighting: ${brief.lighting}` : '',
    brief.mood ? `Mood: ${brief.mood}` : '',
    brief.camera ? `Camera: ${brief.camera}` : '',
    brief.composition,
  ].filter(Boolean).join('. ')

  // Build quality modifiers (role-specific)
  const qualityModifiers = buildQualityModifiers(brief)

  // Fold negative guidance into prompt (Imagen 4 removed negativePrompt support)
  const avoidanceStatement = brief.shouldAvoid.length > 0
    ? `Do not show: ${brief.shouldAvoid.join(', ')}.`
    : ''

  // Industry-specific photography style
  const industryStyle = buildIndustryStyle(brief.businessType)

  // Assemble final prompt
  const parts = [
    subjectStatement,
    environmentStatement,
    styleStatement,
    industryStyle,
    qualityModifiers,
    avoidanceStatement,
  ].filter(s => s.trim().length > 0)

  const prompt = parts.join(' ')

  // Build alt text
  const altText = brief.altText ||
    `${businessName} - ${brief.sectionType.replace(/_/g, ' ')} ${brief.imageRole} image`

  return {
    prompt,
    altText,
    aspectRatio: brief.aspectRatio,
    reasoning:   brief.reasoning,
  }
}

// ── Subject statement builder ─────────────────────────────────────────────────

function buildSubjectStatement(brief: SectionImageBrief, ctx: RichImageContext): string {
  const businessType = brief.businessType.replace(/_/g, ' ')
  const businessName = ctx.tenantName

  // Start with the actual subject from the brief
  const subject = brief.subject || `professional image for ${businessName}`

  // Add must-show elements as a comma-separated qualifier
  const mustShowStr = brief.mustShow
    .filter(m => m.trim())
    .slice(0, 3)
    .join(', ')

  // Build opening line based on section type and business
  const sectionIntro = getSectionIntro(brief.sectionType, businessType, businessName)

  if (mustShowStr) {
    return `${sectionIntro}: ${subject}, featuring ${mustShowStr}.`
  }

  return `${sectionIntro}: ${subject}.`
}

function getSectionIntro(sectionType: string, businessType: string, businessName: string): string {
  const introMap: Record<string, string> = {
    hero:         `Premium commercial hero image for a ${businessType} business called ${businessName}`,
    about:        `Authentic lifestyle portrait for the About section of ${businessName}, a ${businessType} business`,
    feature_grid: `Professional banner image for the Services section of ${businessName}, a ${businessType} business`,
    testimonials: `Abstract soft background for the Testimonials section of ${businessName}`,
    faq:          `Soft decorative image for the FAQ section of ${businessName}`,
    contact:      `Welcoming location image for the Contact section of ${businessName}`,
    product_grid: `Commercial product banner for ${businessName}, a ${businessType} business`,
    image_gallery:`Portfolio showcase image for ${businessName}`,
    cta:          `Conversion-focused background image for the Call-to-Action section of ${businessName}`,
  }

  return introMap[sectionType] ?? `Professional website image for ${businessName}, a ${businessType} business`
}

// ── Quality modifiers by role ─────────────────────────────────────────────────

function buildQualityModifiers(brief: SectionImageBrief): string {
  const baseQuality = 'professional commercial photography, high resolution, 8K quality, sharp focus'

  const roleModifiers: Record<string, string> = {
    hero:        'ultra-sharp hero composition, dramatic commercial photography, premium advertising quality',
    supporting:  'supporting editorial photography, clean professional presentation',
    decorative:  'subtle decorative imagery, soft texture, not distracting',
    product:     'studio-quality product photography, clean background, sharp details',
    team:        'warm lifestyle photography, authentic atmosphere, genuine brand storytelling',
    location:    'architectural exterior photography, warm welcoming tone',
    background:  'full-bleed background texture, safe for text overlay, subtle',
  }

  const roleQuality = roleModifiers[brief.imageRole] ?? baseQuality

  return `${baseQuality}, ${roleQuality}, website-ready, commercially licensed appearance.`
}

// ── Industry-specific photography style ───────────────────────────────────────

function buildIndustryStyle(businessType: string): string {
  const styleMap: Record<string, string> = {
    restaurant:  'Food photography with natural warm lighting, appetizing plating, fresh ingredients visible, bokeh background',
    auto_shop:   'Automotive photography with dramatic studio or outdoor lighting, mirror-like surface reflections, premium presentation',
    salon:       'Beauty photography with bright clean lighting, elegant atmosphere, premium salon environment, soft diffused light',
    contractor:  'Construction/trade photography showing quality craftsmanship, professional tools, and skilled workmanship',
    plumber:     'Professional service photography with clean uniform, modern equipment, trustworthy skilled-tradesperson presentation',
    medical:     'Clean clinical photography with bright natural light, professional medical environment, calming trustworthy atmosphere',
    fitness:     'Action-oriented fitness photography, dynamic energy, motivational gym environment, athletic subjects in motion',
    car_rental:  'Automotive fleet photography, clean outdoor backdrop, premium vehicle presentation, aspirational lifestyle',
    ecommerce:   'Clean commercial product photography with neutral backgrounds, precise focus on product details',
    salon_spa:   'Spa and beauty photography with serene calming atmosphere, soft lighting, luxurious textures',
    general:     'Clean professional business photography, modern environment, trustworthy presentation',
  }

  const normalized = businessType.toLowerCase().replace(/[^a-z_]/g, '_').replace(/__+/g, '_')
  return styleMap[normalized] ?? styleMap.general
}

// ── Section-specific prompt from scratch (alternative to brief system) ────────
// Used by the per-section generate endpoint when a full brief isn't needed

export function buildSectionSpecificPrompt(
  sectionType:      string,
  businessName:     string,
  businessType:     string,
  sectionHeadline:  string,
  services:         string[],
  products:         string[],
  reviews:          string[],
): string {
  const bt = businessType.toLowerCase().replace(/_/g, ' ')

  // Core subject by section type
  const subjectMap: Record<string, string> = {
    hero:         `Premium hero image for ${businessName}, a ${bt} business. ${sectionHeadline ? `Section headline: "${sectionHeadline}".` : ''}`,
    about:        `Authentic behind-the-scenes image of ${businessName}, a ${bt} business. ${sectionHeadline ? `About: "${sectionHeadline}".` : ''}`,
    feature_grid: `Services section banner for ${businessName}. ${services.length ? `Services offered: ${services.slice(0,4).join(', ')}.` : ''}`,
    testimonials: `Abstract warm background for customer testimonials at ${businessName}. ${reviews.length ? `Customers say: "${reviews[0].slice(0,60)}".` : ''}`,
    faq:          `Soft decorative background for FAQ section of ${businessName}.`,
    contact:      `Welcoming storefront or location image for ${businessName}, a ${bt} business.`,
    product_grid: `Product showcase banner for ${businessName}. ${products.length ? `Products: ${products.slice(0,3).join(', ')}.` : ''}`,
    image_gallery:`Portfolio showcase for ${businessName}, a ${bt} business.`,
    cta:          `Action-oriented background for call-to-action section of ${businessName}.`,
  }

  const industryStyle = buildIndustryStyle(businessType)
  const guardrail = 'Do not show: text overlays, watermarks, logos, unrelated industries, generic stock photos.'

  const subject = subjectMap[sectionType] ?? `Professional image for ${businessName}, ${bt} section: ${sectionType}.`

  return [subject, industryStyle, 'professional commercial photography, high resolution, website-ready.', guardrail].join(' ')
}
