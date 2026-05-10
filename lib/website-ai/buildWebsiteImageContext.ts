// lib/website-ai/buildWebsiteImageContext.ts
// SERVER-ONLY — Rich context assembler for AI website image generation.
//
// Pulls ALL available business data from the database:
//   1. Tenant profile (name, description, category)
//   2. AI autofill results (detected business type, services, products, reviews)
//   3. Actual website section content (headlines, bodies, items, CTAs)
//   4. Products and store data
//   5. Site settings (branding, tagline)
//
// Returns a RichImageContext used by buildImagePlannerPrompt and
// createSectionImageBrief to build grounded, business-specific prompts.

import { getSupabaseServerClient } from '@/lib/supabase/server'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RichSectionDetail {
  id:           string
  page_id:      string
  section_type: string
  headline:     string
  body:         string
  items:        string[]      // card titles / service names / FAQ questions
  ctaText:      string
  imageUrl:     string | null
  content:      Record<string, unknown>
}

export interface RichServiceItem {
  name:        string
  price?:      string
  description: string
}

export interface RichProductItem {
  name:        string
  price?:      number
  description: string
}

export interface RichReviewItem {
  author:  string
  text:    string
  rating?: number
}

export interface RichImageContext {
  // Tenant basics
  tenantId:             string
  tenantName:           string
  businessDescription:  string | null
  businessCategory:     string | null

  // Detected by AI autofill
  autofillBusinessType: string | null
  autofillSummary:      string | null

  // Actual section content on the website
  sectionDetails:       RichSectionDetail[]

  // Services extracted from feature_grid sections + autofill
  services:             RichServiceItem[]

  // Top products (if store enabled)
  topProducts:          RichProductItem[]

  // Customer reviews / testimonials
  reviews:              RichReviewItem[]

  // Site metadata
  siteTagline:          string | null
  colorPalette:         string | null
  hasStore:             boolean
  productCount:         number

  // Page list
  pages: Array<{ id: string; slug: string; title: string | null; page_type: string }>

  // Existing image URLs (to avoid regenerating)
  existingImageUrls:    string[]
}

// ── Main assembler ────────────────────────────────────────────────────────────

export async function buildWebsiteImageContext(
  tenantId: string,
): Promise<RichImageContext> {
  const db = getSupabaseServerClient()

  // Run all queries in parallel for speed
  const [
    tenantResult,
    settingsResult,
    pagesResult,
    sectionsResult,
    autofillJobsResult,
    autofillSuggestionsResult,
    productsResult,
    storeModResult,
  ] = await Promise.all([
    // 1. Tenant profile
    db.from('tenants')
      .select('id, name')
      .eq('id', tenantId)
      .maybeSingle(),

    // 2. Site settings (tagline, colors)
    db.from('site_settings')
      .select('site_name, brand_colors, theme, seo_defaults')
      .eq('tenant_id', tenantId)
      .maybeSingle(),

    // 3. All pages (ordered)
    db.from('site_pages')
      .select('id, slug, title, page_type, status')
      .eq('tenant_id', tenantId)
      .neq('status', 'archived')
      .order('sort_order', { ascending: true })
      .limit(20),

    // 4. All visible sections with FULL content
    db.from('site_sections')
      .select('id, page_id, section_type, content, is_visible, sort_order')
      .eq('tenant_id', tenantId)
      .eq('is_visible', true)
      .order('sort_order', { ascending: true })
      .limit(50),

    // 5. Most recent AI autofill job (to get detected business type)
    db.from('website_ai_import_jobs')
      .select('id, detected_business_type, summary, status')
      .eq('tenant_id', tenantId)
      .in('status', ['ready', 'applied'])
      .order('created_at', { ascending: false })
      .limit(1),

    // 6. Applied AI autofill suggestions (services, reviews, FAQ, products)
    db.from('website_ai_suggestions')
      .select('suggestion_type, extracted_data, proposed_section, confidence')
      .eq('tenant_id', tenantId)
      .in('suggestion_type', ['services', 'reviews', 'testimonials', 'products', 'menu', 'about', 'hero'])
      .order('created_at', { ascending: false })
      .limit(30),

    // 7. Top products
    db.from('products')
      .select('id, name, description, price, is_active')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(10),

    // 8. Store module enabled?
    db.from('tenant_modules')
      .select('enabled')
      .eq('tenant_id', tenantId)
      .eq('module_key', 'store')
      .maybeSingle(),
  ])

  const tenant     = tenantResult.data
  const settings   = settingsResult.data
  const pages      = (pagesResult.data ?? []) as Array<{ id: string; slug: string; title: string | null; page_type: string; status: string }>
  const sections   = (sectionsResult.data ?? []) as Array<{ id: string; page_id: string; section_type: string; content: Record<string, unknown>; is_visible: boolean; sort_order: number }>
  const autofillJob = autofillJobsResult.data?.[0] ?? null
  const autofillSuggestions = autofillSuggestionsResult.data ?? []
  const products   = (productsResult.data ?? []) as Array<{ id: string; name: string; description: string | null; price: number; is_active: boolean }>
  const hasStore   = storeModResult.data?.enabled === true

  // ── Detect business description / category ────────────────────────────────
  // business_category: use AI autofill detected type as primary source
  // (tenants table doesn't have a category column; rely on autofill + site settings)
  const businessDescription = null  // Not stored in tenants; would need a profile table

  const businessCategory = autofillJob?.detected_business_type ?? null

  // ── Extract rich section details ──────────────────────────────────────────
  const sectionDetails: RichSectionDetail[] = sections.map((s) => {
    const c = (s.content && typeof s.content === 'object' ? s.content : {}) as Record<string, unknown>
    return {
      id:           s.id,
      page_id:      s.page_id,
      section_type: s.section_type,
      headline:     extractHeadline(c),
      body:         extractBody(c),
      items:        extractItems(c),
      ctaText:      extractCTA(c),
      imageUrl:     extractImageUrl(c),
      content:      c,
    }
  })

  // ── Extract services from feature_grid sections + autofill ────────────────
  const services: RichServiceItem[] = []

  // From feature_grid section content
  const featureGridSections = sectionDetails.filter(s => s.section_type === 'feature_grid')
  for (const section of featureGridSections) {
    const items = Array.isArray(section.content.items) ? section.content.items as unknown[] : []
    for (const item of items) {
      const i = asObj(item)
      const name = typeof i.title === 'string' ? i.title : ''
      if (name) {
        services.push({
          name,
          description: typeof i.description === 'string' ? i.description : '',
        })
      }
    }
  }

  // From autofill suggestions (services type)
  for (const suggestion of autofillSuggestions) {
    if (suggestion.suggestion_type !== 'services') continue
    const data = (suggestion.extracted_data as Record<string, unknown>) ?? {}
    const rawServices = Array.isArray(data.services) ? data.services as unknown[] : []
    for (const svc of rawServices) {
      const s = asObj(svc)
      const name = typeof s.name === 'string' ? s.name : ''
      if (name && !services.some(x => x.name.toLowerCase() === name.toLowerCase())) {
        services.push({
          name,
          price:       typeof s.price === 'string' ? s.price : undefined,
          description: typeof s.description === 'string' ? s.description : '',
        })
      }
    }
  }

  // ── Extract reviews / testimonials ────────────────────────────────────────
  const reviews: RichReviewItem[] = []

  // From testimonials section content
  const testimonialSections = sectionDetails.filter(s => s.section_type === 'testimonials')
  for (const section of testimonialSections) {
    const items = Array.isArray(section.content.items) ? section.content.items as unknown[] : []
    for (const item of items) {
      const i = asObj(item)
      if (typeof i.text === 'string' && i.text) {
        reviews.push({
          author:  typeof i.name === 'string' ? i.name : 'Customer',
          text:    i.text,
          rating:  typeof i.rating === 'number' ? i.rating : undefined,
        })
      }
    }
  }

  // From autofill review suggestions
  for (const suggestion of autofillSuggestions) {
    if (suggestion.suggestion_type !== 'reviews' && suggestion.suggestion_type !== 'testimonials') continue
    const data = (suggestion.extracted_data as Record<string, unknown>) ?? {}
    const rawReviews = Array.isArray(data.reviews) ? data.reviews as unknown[] : []
    for (const r of rawReviews) {
      const rev = asObj(r)
      if (typeof rev.quote === 'string' && rev.quote) {
        reviews.push({
          author:  typeof rev.name === 'string' ? rev.name : 'Customer',
          text:    rev.quote,
          rating:  typeof rev.rating === 'number' ? rev.rating : undefined,
        })
      }
    }
  }

  // ── Collect existing image URLs ───────────────────────────────────────────
  const existingImageUrls: string[] = []
  for (const section of sectionDetails) {
    if (section.imageUrl) existingImageUrls.push(section.imageUrl)
  }

  // ── Tagline / color palette ───────────────────────────────────────────────
  const seoDefaults = (settings?.seo_defaults as Record<string, unknown> | null) ?? {}
  const siteTagline =
    (typeof seoDefaults.description === 'string' ? seoDefaults.description.slice(0, 120) : null) ??
    null
  const colorPalette = settings?.brand_colors ? JSON.stringify(settings.brand_colors) : null

  // ── Products ──────────────────────────────────────────────────────────────
  const topProducts: RichProductItem[] = products.map(p => ({
    name:        p.name,
    price:       p.price,
    description: p.description ?? '',
  }))

  return {
    tenantId,
    tenantName:           tenant?.name ?? 'Business',
    businessDescription,
    businessCategory,
    autofillBusinessType: autofillJob?.detected_business_type ?? null,
    autofillSummary:      autofillJob?.summary ?? null,
    sectionDetails,
    services:             services.slice(0, 10),  // cap to avoid huge prompts
    topProducts:          topProducts.slice(0, 8),
    reviews:              reviews.slice(0, 5),
    siteTagline,
    colorPalette,
    hasStore,
    productCount:         products.length,
    pages:                pages.map(p => ({ id: p.id, slug: p.slug, title: p.title, page_type: p.page_type })),
    existingImageUrls,
  }
}

// ── Safe field extractors ─────────────────────────────────────────────────────

function extractHeadline(c: Record<string, unknown>): string {
  return firstString(c.headline, c.heading, c.title, c.name) ?? ''
}

function extractBody(c: Record<string, unknown>): string {
  return firstString(c.body, c.subheadline, c.subtitle, c.description, c.text) ?? ''
}

function extractCTA(c: Record<string, unknown>): string {
  return firstString(c.ctaLabel, c.cta_label, c.buttonText, c.button_text) ?? ''
}

function extractImageUrl(c: Record<string, unknown>): string | null {
  return firstString(
    c.backgroundImage, c.background_image, c.imageUrl, c.image_url,
    c.image, c.bannerImage, c.banner_image,
  ) ?? null
}

function extractItems(c: Record<string, unknown>): string[] {
  const items = Array.isArray(c.items) ? c.items : []
  return items
    .map((i) => {
      const obj = asObj(i)
      return firstString(obj.title, obj.name, obj.question, obj.text) ?? ''
    })
    .filter(Boolean)
    .slice(0, 6)
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

function asObj(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  return {}
}
