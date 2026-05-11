// lib/website-ai/createSectionImageBrief.ts
// NOTE: All aspectRatio values must be Imagen-supported (1:1 | 9:16 | 16:9 | 4:3 | 3:4).
//       Use normalizeImagenAspectRatio from imagenAspectRatios.ts before any API call.
// SERVER-ONLY — creates a structured image brief for a specific section.
//
// Given a RichImageContext and a target section, returns a structured brief
// that describes exactly what the image should show, grounded in the
// actual business type, section content, and real customer language.

import type { ImagenAspectRatio } from './imagenAspectRatios'
import type { RichImageContext, RichSectionDetail } from './buildWebsiteImageContext'

export type ImageBriefRole =
  | 'hero'
  | 'supporting'
  | 'decorative'
  | 'product'
  | 'team'
  | 'location'
  | 'background'

export interface SectionImageBrief {
  imageGoal:    string
  imageRole:    ImageBriefRole
  sectionType:  string
  businessType: string
  subject:      string
  mustShow:     string[]
  shouldAvoid:  string[]
  composition:  string
  environment:  string
  styling:      string
  lighting:     string
  mood:         string
  camera:       string
  altText:      string
  aspectRatio:  ImagenAspectRatio
  reasoning:    string
}

// ── Main factory ──────────────────────────────────────────────────────────────

export function createSectionImageBrief(
  ctx:     RichImageContext,
  section: RichSectionDetail,
): SectionImageBrief {
  const businessType = resolveBusinessType(ctx)
  const base = buildBaseBrief(businessType, ctx, section)
  return applyContextOverrides(base, ctx, section)
}

// ── Business type resolver ────────────────────────────────────────────────────

function resolveBusinessType(ctx: RichImageContext): string {
  return (
    ctx.businessCategory ??
    ctx.autofillBusinessType ??
    inferBusinessTypeFromContent(ctx) ??
    'general'
  ).toLowerCase().replace(/\s+/g, '_')
}

function inferBusinessTypeFromContent(ctx: RichImageContext): string | null {
  const allText = [
    ctx.businessDescription ?? '',
    ctx.autofillSummary ?? '',
    ...ctx.services.map(s => `${s.name} ${s.description}`),
    ...ctx.topProducts.map(p => `${p.name} ${p.description}`),
    ...ctx.sectionDetails.map(s => `${s.headline} ${s.body}`),
  ].join(' ').toLowerCase()

  if (/pho|noodle|ramen|sushi|pizza|burger|restaurant|cafe|coffee|bakery|food|cuisine|dining|menu|dish/.test(allText)) return 'restaurant'
  if (/ceramic coat|detail|polish|paint correction|car wash|auto detailing/.test(allText)) return 'auto_shop'
  if (/hair|lash|brow|facial|wax|nail|beauty|salon|spa|skincare|estheti/.test(allText)) return 'salon'
  if (/roof|roofing|siding|gutter|shingle|contractor/.test(allText)) return 'contractor'
  if (/plumb|pipe|drain|leak|water heater|hvac|heat|air condition/.test(allText)) return 'plumber'
  if (/dental|dentist|orthodont|tooth|teeth/.test(allText)) return 'medical'
  if (/gym|fitness|workout|yoga|crossfit|personal train|nutrition/.test(allText)) return 'fitness'
  if (/rent|car rental|fleet|vehicle|lease/.test(allText)) return 'car_rental'
  if (/shop|store|ecommerce|product|buy|cart|shipping/.test(allText)) return 'ecommerce'
  return null
}

// ── Section-specific brief builders ──────────────────────────────────────────

function buildBaseBrief(
  businessType: string,
  ctx:          RichImageContext,
  section:      RichSectionDetail,
): SectionImageBrief {
  switch (section.section_type) {
    case 'hero': return buildHeroBrief(businessType, ctx, section)
    case 'about': return buildAboutBrief(businessType, ctx, section)
    case 'feature_grid': return buildFeatureGridBrief(businessType, ctx, section)
    case 'testimonials': return buildTestimonialsBrief(businessType, ctx, section)
    case 'faq': return buildFaqBrief(businessType, ctx, section)
    case 'contact': return buildContactBrief(businessType, ctx, section)
    case 'product_grid': return buildProductGridBrief(businessType, ctx, section)
    case 'image_gallery': return buildGalleryBrief(businessType, ctx, section)
    case 'cta': return buildCtaBrief(businessType, ctx, section)
    default: return buildGenericBrief(businessType, ctx, section)
  }
}

// ── Hero ───────────────────────────────────────────────────────────────────────

function buildHeroBrief(bt: string, ctx: RichImageContext, s: RichSectionDetail): SectionImageBrief {
  const subjectMap: Record<string, string> = {
    restaurant:  `Signature dish or dining scene at ${ctx.tenantName}`,
    auto_shop:   `Premium vehicle after professional detailing at ${ctx.tenantName}`,
    salon:       `Modern beauty salon interior or signature service at ${ctx.tenantName}`,
    contractor:  `Professional craftsperson completing high-quality work for ${ctx.tenantName}`,
    plumber:     `Skilled technician on a professional service call for ${ctx.tenantName}`,
    medical:     `Clean modern medical office interior for ${ctx.tenantName}`,
    fitness:     `Dynamic fitness action shot in a modern gym for ${ctx.tenantName}`,
    car_rental:  `Premium fleet vehicle ready for rental from ${ctx.tenantName}`,
    ecommerce:   `Flagship product showcase for ${ctx.tenantName}`,
    general:     `Flagship visual representing the best of ${ctx.tenantName}`,
  }

  const environmentMap: Record<string, string> = {
    restaurant:  'Restaurant dining room, kitchen, or food preparation area',
    auto_shop:   'Professional detail bay or clean garage',
    salon:       'Modern beauty salon with styling stations',
    contractor:  'Residential or commercial work site',
    plumber:     'On-site service location (home, commercial)',
    medical:     'Medical office, examination room, or reception',
    fitness:     'Modern gym floor, training area',
    car_rental:  'Clean outdoor lot, showroom, or urban backdrop',
    ecommerce:   'Clean studio or lifestyle product environment',
    general:     'Business premises or professional environment',
  }

  const servicesPreview = ctx.services.slice(0, 3).map(s => s.name).join(', ')

  return {
    imageGoal:    `Create a flagship hero image that instantly communicates what ${ctx.tenantName} offers`,
    imageRole:    'hero',
    sectionType:  'hero',
    businessType: bt,
    subject:      subjectMap[bt] ?? subjectMap.general,
    mustShow:     [
      bt === 'restaurant' ? 'appetizing food or inviting dining atmosphere' : '',
      bt === 'auto_shop' ? 'polished vehicle or skilled technician' : '',
      bt === 'salon' ? 'beauty service environment or premium salon interior' : '',
      servicesPreview ? `business specialties: ${servicesPreview}` : '',
      s.headline ? `visual match for headline: "${s.headline.slice(0, 60)}"` : '',
    ].filter(Boolean),
    shouldAvoid:  [
      'generic stock office workers',
      'unrelated industry imagery',
      'abstract shapes unless appropriate',
      'text overlays',
      'watermarks',
    ],
    composition:  'Wide hero composition (16:9), subject prominent in center or rule-of-thirds, clear negative space for text overlay',
    environment:  environmentMap[bt] ?? environmentMap.general,
    styling:      'Premium commercial photography, clean and professional',
    lighting:     bt === 'restaurant' ? 'Warm natural or ambient restaurant lighting' : bt === 'salon' ? 'Bright, clean, flattering salon lighting' : 'Professional even lighting, no harsh shadows',
    mood:         bt === 'restaurant' ? 'Appetizing, inviting, warm' : bt === 'fitness' ? 'Energetic, motivational' : bt === 'medical' ? 'Clean, trustworthy, calm' : 'Professional, premium, trustworthy',
    camera:       'Wide angle lens, 24-35mm equivalent, sharp focus on subject',
    altText:      `${ctx.tenantName} - ${s.headline || 'hero image'}`,
    aspectRatio:  '16:9',
    reasoning:    `Hero section image for ${ctx.tenantName} (${bt}). Headline: "${s.headline}". Must immediately show what the business does to reduce bounce rate.`,
  }
}

// ── About ──────────────────────────────────────────────────────────────────────

function buildAboutBrief(bt: string, ctx: RichImageContext, s: RichSectionDetail): SectionImageBrief {
  return {
    imageGoal:    `Show the human story and identity behind ${ctx.tenantName}`,
    imageRole:    'team',
    sectionType:  'about',
    businessType: bt,
    subject:      `The founder, team, workspace, or behind-the-scenes of ${ctx.tenantName}`,
    mustShow:     [
      'authentic business environment or work in progress',
      bt === 'restaurant' ? 'kitchen, chef, or food preparation' : '',
      bt === 'auto_shop' ? 'technician working on vehicle or professional garage setup' : '',
      bt === 'salon' ? 'stylist at work or the salon\'s signature atmosphere' : '',
      bt === 'contractor' ? 'craftsperson demonstrating skill and attention to quality' : '',
      s.body ? `visuals that match: "${s.body.slice(0, 80)}"` : '',
    ].filter(Boolean),
    shouldAvoid:  ['generic stock photos', 'unrelated workplaces', 'overly posed corporate shots'],
    composition:  '4:3 ratio, warm and approachable composition, subject centered or slight left',
    environment:  'Real business workspace, genuine atmosphere',
    styling:      'Lifestyle documentary photography, authentic, warm',
    lighting:     'Natural window light or warm ambient, flattering and genuine',
    mood:         'Trustworthy, human, authentic, relatable',
    camera:       '50mm equivalent, portrait or environmental shot',
    altText:      `${ctx.tenantName} - ${s.headline || 'about us'}`,
    aspectRatio:  '4:3',
    reasoning:    `About section for ${ctx.tenantName}. Body: "${s.body.slice(0, 80)}". Should humanize the brand.`,
  }
}

// ── Feature Grid / Services ────────────────────────────────────────────────────

function buildFeatureGridBrief(bt: string, ctx: RichImageContext, s: RichSectionDetail): SectionImageBrief {
  const servicesList = ctx.services.slice(0, 4).map(sv => sv.name).join(', ') || s.items.join(', ')

  return {
    imageGoal:    `Supporting banner image for the services section of ${ctx.tenantName}`,
    imageRole:    'supporting',
    sectionType:  'feature_grid',
    businessType: bt,
    subject:      `Representation of the services offered: ${servicesList || bt + ' services'}`,
    mustShow:     [
      servicesList ? `services: ${servicesList}` : '',
      'professional quality and craftsmanship',
      bt === 'restaurant' ? 'food preparation or ingredients' : '',
      bt === 'auto_shop' ? 'service tools, techniques, or results' : '',
    ].filter(Boolean),
    shouldAvoid:  ['text-heavy imagery', 'generic office scenes', 'unrelated visuals'],
    composition:  '16:9 wide banner, horizontal layout, good for top of services section',
    environment:  'Professional service environment',
    styling:      'Clean commercial photography',
    lighting:     'Even professional lighting',
    mood:         'Professional, capable, reliable',
    camera:       'Wide angle, environmental context visible',
    altText:      `${ctx.tenantName} services - ${s.headline || 'our services'}`,
    aspectRatio:  '16:9',
    reasoning:    `Feature grid banner for ${ctx.tenantName}. Services: ${servicesList}. Section headline: "${s.headline}".`,
  }
}

// ── Testimonials ───────────────────────────────────────────────────────────────

function buildTestimonialsBrief(bt: string, ctx: RichImageContext, s: RichSectionDetail): SectionImageBrief {
  const reviewTone = ctx.reviews.length > 0
    ? ctx.reviews[0].text.slice(0, 80)
    : 'happy customers'

  return {
    imageGoal:    `Abstract background for testimonials section that feels warm and trustworthy`,
    imageRole:    'background',
    sectionType:  'testimonials',
    businessType: bt,
    subject:      'Soft abstract background with warm tones, no people, no text',
    mustShow:     ['warm inviting tones', 'soft texture or gradient', 'no recognizable faces'],
    shouldAvoid:  ['stock photo people', 'unrelated imagery', 'harsh colors', 'corporate backgrounds'],
    composition:  '16:9, full bleed background texture, safe for text overlay',
    environment:  'Abstract or slightly out-of-focus relevant environment',
    styling:      'Soft, abstract, pastel or warm gradient',
    lighting:     'Soft diffused, no harsh shadows',
    mood:         bt === 'restaurant' ? 'Warm, inviting, appetizing' : bt === 'salon' ? 'Soft, elegant, relaxing' : 'Warm, trustworthy, positive',
    camera:       'Abstract composition, no specific subject in focus',
    altText:      `${ctx.tenantName} - customer reviews background`,
    aspectRatio:  '16:9',
    reasoning:    `Testimonials background for ${ctx.tenantName}. Customer tone: "${reviewTone}". Should feel warm and trustworthy without showing random faces.`,
  }
}

// ── FAQ ────────────────────────────────────────────────────────────────────────

function buildFaqBrief(bt: string, ctx: RichImageContext, s: RichSectionDetail): SectionImageBrief {
  return {
    imageGoal:    `Soft decorative image for FAQ section`,
    imageRole:    'decorative',
    sectionType:  'faq',
    businessType: bt,
    subject:      `Soft, abstract decorative image related to ${ctx.tenantName}`,
    mustShow:     ['soft textures', 'minimal visual noise', 'appropriate brand colors'],
    shouldAvoid:  ['people', 'text', 'bold colors that distract from FAQ content'],
    composition:  '16:9, subtle, can be used as soft background',
    environment:  'Abstract or blurred relevant environment',
    styling:      'Minimal, subtle, decorative',
    lighting:     'Soft, even, non-distracting',
    mood:         'Calm, helpful, approachable',
    camera:       'Soft focus, abstract',
    altText:      `${ctx.tenantName} - FAQ`,
    aspectRatio:  '16:9',
    reasoning:    `FAQ section for ${ctx.tenantName}. Section: "${s.headline}". Needs a non-distracting decorative background.`,
  }
}

// ── Contact ────────────────────────────────────────────────────────────────────

function buildContactBrief(bt: string, ctx: RichImageContext, s: RichSectionDetail): SectionImageBrief {
  const locationMap: Record<string, string> = {
    restaurant:  'Restaurant storefront, entrance, or dining room with welcoming atmosphere',
    auto_shop:   'Professional auto shop exterior or service bay entrance',
    salon:       'Beauty salon exterior or inviting reception area',
    contractor:  'Contractor\'s work van or completed job exterior',
    plumber:     'Professional service van or technician arriving at residential location',
    medical:     'Medical office building exterior or welcoming reception',
    fitness:     'Gym entrance or exterior with branding',
    car_rental:  'Car rental location, lot entrance, or office front',
    general:     'Business storefront, entrance, or welcoming exterior',
  }

  return {
    imageGoal:    `Show the physical location or contactable presence of ${ctx.tenantName}`,
    imageRole:    'location',
    sectionType:  'contact',
    businessType: bt,
    subject:      locationMap[bt] ?? locationMap.general,
    mustShow:     ['welcoming, accessible feeling', 'professional environment', 'physical or visual presence of the business'],
    shouldAvoid:  ['generic maps or GPS icons', 'stock imagery unrelated to this business type'],
    composition:  '16:9, welcoming wide shot',
    environment:  locationMap[bt] ?? locationMap.general,
    styling:      'Warm, welcoming, commercial photography',
    lighting:     'Bright daytime exterior or warm interior',
    mood:         'Welcoming, accessible, professional, approachable',
    camera:       'Wide angle, exterior or interior entrance',
    altText:      `${ctx.tenantName} - contact us`,
    aspectRatio:  '16:9',
    reasoning:    `Contact section for ${ctx.tenantName}. Should show physical presence and be welcoming.`,
  }
}

// ── Product Grid ───────────────────────────────────────────────────────────────

function buildProductGridBrief(bt: string, ctx: RichImageContext, s: RichSectionDetail): SectionImageBrief {
  const topProductNames = ctx.topProducts.slice(0, 3).map(p => p.name).join(', ')

  return {
    imageGoal:    `Banner image representing the product offerings of ${ctx.tenantName}`,
    imageRole:    'product',
    sectionType:  'product_grid',
    businessType: bt,
    subject:      topProductNames ? `Products: ${topProductNames}` : `Product collection for ${ctx.tenantName}`,
    mustShow:     [
      topProductNames ? `these products: ${topProductNames}` : 'representative products',
      'premium product presentation',
      bt === 'restaurant' ? 'food items or menu highlights' : '',
    ].filter(Boolean),
    shouldAvoid:  ['generic shopping cart icons', 'unrelated products'],
    composition:  '16:9 wide banner, product-focused',
    environment:  bt === 'restaurant' ? 'Restaurant table or food styling environment' : 'Clean studio with neutral background',
    styling:      'Commercial product photography, clean and professional',
    lighting:     'Studio lighting or natural light, sharp and clear',
    mood:         'Enticing, premium, desirable',
    camera:       'Product close-up or flat lay composition',
    altText:      `${ctx.tenantName} - products`,
    aspectRatio:  '16:9',
    reasoning:    `Product grid banner for ${ctx.tenantName}. Products: ${topProductNames}. Should make products look desirable.`,
  }
}

// ── Gallery ────────────────────────────────────────────────────────────────────

function buildGalleryBrief(bt: string, ctx: RichImageContext, s: RichSectionDetail): SectionImageBrief {
  return {
    imageGoal:    `Gallery image showcasing the work or atmosphere of ${ctx.tenantName}`,
    imageRole:    'supporting',
    sectionType:  'image_gallery',
    businessType: bt,
    subject:      `Portfolio or showcase image for ${ctx.tenantName}`,
    mustShow:     ['finished work', 'business environment', 'quality and craft'],
    shouldAvoid:  ['unrelated imagery', 'generic stock'],
    composition:  '4:3 or 1:1, gallery grid compatible',
    environment:  'Real business environment or completed work',
    styling:      'Editorial photography, clean and polished',
    lighting:     'Natural or professional lighting',
    mood:         'Professional, proud of work, high quality',
    camera:       'Portrait or square format, clean composition',
    altText:      `${ctx.tenantName} gallery`,
    aspectRatio:  '4:3',
    reasoning:    `Gallery section for ${ctx.tenantName}. Should showcase actual work quality.`,
  }
}

// ── CTA ────────────────────────────────────────────────────────────────────────

function buildCtaBrief(bt: string, ctx: RichImageContext, s: RichSectionDetail): SectionImageBrief {
  return {
    imageGoal:    `Action-oriented background image for CTA section`,
    imageRole:    'background',
    sectionType:  'cta',
    businessType: bt,
    subject:      `Motivating background for CTA: "${s.ctaText || 'Get Started'}"`,
    mustShow:     ['action-oriented visual', 'strong composition', 'appropriate for dark text overlay'],
    shouldAvoid:  ['cluttered scenes', 'distracting foreground elements'],
    composition:  '16:9 full bleed, safe for center text overlay',
    environment:  'Relevant to the business call-to-action',
    styling:      'Bold, conversion-focused commercial photography',
    lighting:     'Dynamic, slightly dramatic, high contrast acceptable',
    mood:         'Energetic, action-oriented, motivating',
    camera:       'Wide angle, strong lead-in composition',
    altText:      `${ctx.tenantName} - ${s.ctaText || 'call to action'}`,
    aspectRatio:  '16:9',
    reasoning:    `CTA section for ${ctx.tenantName}. CTA text: "${s.ctaText}". Should drive action.`,
  }
}

// ── Generic fallback ───────────────────────────────────────────────────────────

function buildGenericBrief(bt: string, ctx: RichImageContext, s: RichSectionDetail): SectionImageBrief {
  return {
    imageGoal:    `Professional image for the ${s.section_type} section of ${ctx.tenantName}`,
    imageRole:    'supporting',
    sectionType:  s.section_type,
    businessType: bt,
    subject:      `Professional business image for ${ctx.tenantName}`,
    mustShow:     ['professional quality', 'relevant to business type'],
    shouldAvoid:  ['generic stock', 'unrelated industries'],
    composition:  '16:9, clean',
    environment:  'Professional business environment',
    styling:      'Commercial photography',
    lighting:     'Professional lighting',
    mood:         'Professional, trustworthy',
    camera:       'Standard commercial photography',
    altText:      `${ctx.tenantName} - ${s.headline || s.section_type}`,
    aspectRatio:  '16:9',
    reasoning:    `Generic section for ${ctx.tenantName}, type: ${s.section_type}. Section headline: "${s.headline}".`,
  }
}

// ── Context overrides ──────────────────────────────────────────────────────────
// Apply any additional overrides based on real section content

function applyContextOverrides(
  brief:   SectionImageBrief,
  ctx:     RichImageContext,
  section: RichSectionDetail,
): SectionImageBrief {
  const updated = { ...brief }

  // If the section has actual content, refine mustShow
  if (section.headline) {
    updated.mustShow = [
      `visual match for section headline: "${section.headline.slice(0, 60)}"`,
      ...updated.mustShow.filter(m => !m.includes('headline')),
    ]
  }

  // If we have real customer reviews, use their language
  if (ctx.reviews.length > 0 && brief.sectionType === 'hero') {
    const reviewKeywords = extractKeywordsFromReviews(ctx.reviews.slice(0, 3).map(r => r.text))
    if (reviewKeywords) {
      updated.mustShow.push(`customer-validated qualities: ${reviewKeywords}`)
    }
  }

  return updated
}

function extractKeywordsFromReviews(reviewTexts: string[]): string {
  const allWords = reviewTexts.join(' ').toLowerCase()
  const qualityWords = ['clean', 'professional', 'fast', 'friendly', 'amazing', 'beautiful', 'fresh', 'quality', 'delicious', 'excellent', 'great', 'perfect']
  const found = qualityWords.filter(w => allWords.includes(w))
  return found.slice(0, 3).join(', ')
}
