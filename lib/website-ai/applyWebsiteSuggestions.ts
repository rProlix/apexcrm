// lib/website-ai/applyWebsiteSuggestions.ts
// Applies accepted AI suggestions to the Website Builder (site_sections, site_settings, products).

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { mapSuggestionToSection, isDuplicateReview, isDuplicateService, isDuplicateFaq } from './sectionMapper'
import type { AiSuggestion, AiAppliedChange, ApplyResult, PublishMode } from './types'
import type { TestimonialsContent, FeatureGridContent, FaqContent } from '@/lib/website/types'
import { normalizeDesignSystem, serializeDesignSystem, buildCssVars } from '@/lib/website/design/normalizeDesignSystem'
import { applySectionFlow } from '@/lib/website/design/sectionFlow'
import { normalizeSectionDesign } from '@/lib/website/design/normalizeDesignSystem'

interface ApplyContext {
  tenantId:    string
  jobId:       string
  appliedBy:   string
  publishMode: PublishMode
  /** Optional: raw design system from Gemini response */
  rawDesignSystem?: Record<string, unknown>
  /** Optional: detected business type from Gemini */
  detectedBusinessType?: string
}

export async function applyWebsiteSuggestions(
  suggestions: AiSuggestion[],
  ctx:         ApplyContext,
): Promise<ApplyResult> {
  const db      = getSupabaseServerClient()
  const result: ApplyResult = { applied: 0, skipped: 0, errors: [], changes: [] }

  // Skip rejected suggestions
  const toApply = suggestions.filter((s) => s.status !== 'rejected' && s.status !== 'applied')

  // Ensure a home page exists to hang sections on
  const homePageId = await getOrCreateHomePage(ctx.tenantId)

  for (const suggestion of toApply) {
    try {
      const change = await applySingleSuggestion(suggestion, ctx, homePageId)
      if (change) {
        result.applied++
        result.changes.push(change)
      } else {
        result.skipped++
      }
    } catch (err: unknown) {
      result.errors.push(
        `Failed to apply "${suggestion.title ?? suggestion.suggestion_type}": ${err instanceof Error ? err.message : String(err)}`
      )
      result.skipped++
    }
  }

  // Apply design system to site_settings after sections are done
  if (result.applied > 0) {
    try {
      await applyDesignSystem(ctx)
    } catch (err) {
      result.errors.push(`Design system save failed (non-critical): ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Publish if requested
  if (ctx.publishMode === 'publish_now' && result.applied > 0) {
    await db
      .from('site_settings')
      .update({ is_published: true })
      .eq('tenant_id', ctx.tenantId)
  }

  return result
}

// ── Single suggestion dispatcher ──────────────────────────────────────────────

async function applySingleSuggestion(
  suggestion:  AiSuggestion,
  ctx:         ApplyContext,
  homePageId:  string,
): Promise<AiAppliedChange | null> {
  const type = suggestion.suggestion_type

  if (type === 'seo') {
    return applySeoSuggestion(suggestion, ctx)
  }

  if (type === 'social_links') {
    return applySocialLinksSuggestion(suggestion, ctx)
  }

  if (type === 'products' || type === 'menu') {
    return applyProductsSuggestion(suggestion, ctx, homePageId)
  }

  // Default: map to a site_section
  return applySectionSuggestion(suggestion, ctx, homePageId)
}

// ── Design system application ──────────────────────────────────────────────────

async function applyDesignSystem(ctx: ApplyContext): Promise<void> {
  const db = getSupabaseServerClient()

  // Normalize the AI-generated design system (falls back to category preset)
  const normalizedDs = normalizeDesignSystem(
    ctx.rawDesignSystem ?? {},
    ctx.detectedBusinessType ?? null,
  )
  const serialized = serializeDesignSystem(normalizedDs)
  const cssVars    = buildCssVars(normalizedDs)

  // Save to site_settings.theme — this drives the CSS variables for the whole site
  await db
    .from('site_settings')
    .update({
      theme: { ...serialized, cssVars } as never,
      brand_colors: {
        primary:    normalizedDs.palette.primary,
        secondary:  normalizedDs.palette.secondary,
        accent:     normalizedDs.palette.accent,
        background: normalizedDs.palette.background,
        surface:    normalizedDs.palette.surface,
        text:       normalizedDs.palette.textPrimary,
        muted:      normalizedDs.palette.mutedText,
        border:     normalizedDs.palette.border,
      } as never,
      fonts: {
        heading: normalizedDs.typography.headingFontStack,
        body:    normalizedDs.typography.bodyFontStack,
      } as never,
    } as never)
    .eq('tenant_id', ctx.tenantId)

  // Also apply section flow to all existing sections to create visual rhythm
  const { data: allSections } = await db
    .from('site_sections')
    .select('id, section_type, style_config, sort_order')
    .eq('tenant_id', ctx.tenantId)
    .order('sort_order', { ascending: true })

  if (allSections && allSections.length > 0) {
    const sectionsWithDesign = applySectionFlow(
      allSections.map((s) => {
        const sr = s as unknown as Record<string, unknown>
        return {
          id:           sr.id as string,
          type:         sr.section_type as string,
          style_config: (sr.style_config as Record<string, unknown>) ?? {},
        }
      }),
      normalizedDs,
    )

    for (const sec of sectionsWithDesign) {
      await db
        .from('site_sections')
        .update({ style_config: sec.style_config } as never)
        .eq('id', sec.id)
        .eq('tenant_id', ctx.tenantId)
    }
  }
}

// ── Section-based application ──────────────────────────────────────────────────

async function applySectionSuggestion(
  suggestion:  AiSuggestion,
  ctx:         ApplyContext,
  homePageId:  string,
): Promise<AiAppliedChange | null> {
  const db     = getSupabaseServerClient()
  const mapped = mapSuggestionToSection({
    type:            suggestion.suggestion_type as never,
    action:          suggestion.action,
    confidence:      suggestion.confidence,
    title:           suggestion.title ?? '',
    reason:          suggestion.reason ?? '',
    data:            suggestion.extracted_data,
    proposedSection: suggestion.proposed_section as never,
  })

  const pageId = suggestion.target_page_id ?? homePageId

  // Find existing section of same type on the same page
  const { data: existing } = await db
    .from('site_sections')
    .select('id, content, sort_order')
    .eq('tenant_id', ctx.tenantId)
    .eq('page_id', pageId)
    .eq('section_type', mapped.section_type)
    .maybeSingle()

  const action = suggestion.action

  if (existing && (action === 'append' || action === 'update')) {
    const merged = mergeContent(mapped.section_type, existing.content as Record<string, unknown>, mapped.content as Record<string, unknown>)
    await db
      .from('site_sections')
      .update({ content: merged as never })
      .eq('id', existing.id)

    await markApplied(db, suggestion.id, ctx)
    return buildChange(ctx, suggestion.id, 'website_section', existing.id, existing.content as Record<string, unknown>, merged)
  }

  if (existing && action === 'replace') {
    await db
      .from('site_sections')
      .update({ content: mapped.content as never })
      .eq('id', existing.id)

    await markApplied(db, suggestion.id, ctx)
    return buildChange(ctx, suggestion.id, 'website_section', existing.id, existing.content as Record<string, unknown>, mapped.content as Record<string, unknown>)
  }

  // Create new section
  const { data: maxSort } = await db
    .from('site_sections')
    .select('sort_order')
    .eq('tenant_id', ctx.tenantId)
    .eq('page_id', pageId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextSort = ((maxSort?.sort_order as number) ?? -1) + 1

  // Extract design from proposedSection if present (normalized to ensure valid enums)
  const rawDesign = (suggestion.proposed_section as Record<string, unknown>)?.design
  const sectionDesign = rawDesign ? normalizeSectionDesign(rawDesign, {} as never) : null

  const { data: created, error } = await db
    .from('site_sections')
    .insert({
      tenant_id:    ctx.tenantId,
      page_id:      pageId,
      section_type: mapped.section_type,
      section_key:  null,
      content:      mapped.content as never,
      sort_order:   nextSort,
      is_visible:   true,
      ...(sectionDesign ? { style_config: { design: sectionDesign } } : {}),
    } as never)
    .select('*')
    .single()

  if (error || !created) throw new Error(error?.message ?? 'Insert failed')

  await markApplied(db, suggestion.id, ctx)
  return buildChange(ctx, suggestion.id, 'website_section', (created as { id: string }).id, null, mapped.content as Record<string, unknown>)
}

// ── SEO suggestion ─────────────────────────────────────────────────────────────

async function applySeoSuggestion(
  suggestion: AiSuggestion,
  ctx:        ApplyContext,
): Promise<AiAppliedChange | null> {
  const db   = getSupabaseServerClient()
  const data = suggestion.extracted_data

  const { data: settings } = await db
    .from('site_settings')
    .select('id, seo_defaults')
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()

  if (!settings) return null

  const existing  = (settings.seo_defaults as Record<string, unknown>) ?? {}
  const merged    = {
    ...existing,
    ...(data.title       ? { title:       data.title       } : {}),
    ...(data.description ? { description: data.description } : {}),
    ...(data.keywords    ? { keywords:    data.keywords    } : {}),
  }

  await db
    .from('site_settings')
    .update({ seo_defaults: merged as never })
    .eq('tenant_id', ctx.tenantId)

  await markApplied(db, suggestion.id, ctx)
  return buildChange(ctx, suggestion.id, 'website_settings', settings.id, existing, merged)
}

// ── Social links ───────────────────────────────────────────────────────────────

async function applySocialLinksSuggestion(
  suggestion: AiSuggestion,
  ctx:        ApplyContext,
): Promise<AiAppliedChange | null> {
  const db   = getSupabaseServerClient()
  const data = suggestion.extracted_data

  const { data: settings } = await db
    .from('site_settings')
    .select('id, footer_config')
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()

  if (!settings) return null

  const existing     = (settings.footer_config as Record<string, unknown>) ?? {}
  const existSocials = (existing.socials as Record<string, unknown>) ?? {}
  const newSocials   = (data.socials as Record<string, unknown>) ?? {}

  const merged = {
    ...existing,
    socials:     { ...existSocials, ...newSocials },
    showSocials: true,
  }

  await db
    .from('site_settings')
    .update({ footer_config: merged as never })
    .eq('tenant_id', ctx.tenantId)

  await markApplied(db, suggestion.id, ctx)
  return buildChange(ctx, suggestion.id, 'website_settings', settings.id, existing, merged)
}

// ── Products / menu ───────────────────────────────────────────────────────────

async function applyProductsSuggestion(
  suggestion:  AiSuggestion,
  ctx:         ApplyContext,
  homePageId:  string,
): Promise<AiAppliedChange | null> {
  const db       = getSupabaseServerClient()
  const products = Array.isArray(suggestion.extracted_data.products)
    ? (suggestion.extracted_data.products as Array<Record<string, unknown>>)
    : []

  // Check if store module is enabled
  const { data: storeModule } = await db
    .from('tenant_modules')
    .select('id, enabled')
    .eq('tenant_id', ctx.tenantId)
    .eq('module_key', 'store')
    .maybeSingle()

  const storeEnabled = storeModule?.enabled === true

  if (storeEnabled && products.length > 0) {
    // Fetch existing product names to avoid duplicates
    const { data: existingProducts } = await db
      .from('products')
      .select('name')
      .eq('tenant_id', ctx.tenantId)

    const existingNames = new Set(
      (existingProducts ?? []).map((p: { name: string }) => p.name.toLowerCase().trim())
    )

    let createdCount = 0
    for (const product of products) {
      const name = typeof product.name === 'string' ? product.name.trim() : ''
      if (!name || existingNames.has(name.toLowerCase())) continue

      const priceStr = typeof product.price === 'string' ? product.price.replace(/[^0-9.]/g, '') : ''
      const price    = priceStr ? parseFloat(priceStr) : null

      await db.from('products').insert({
        tenant_id:   ctx.tenantId,
        name,
        description: typeof product.description === 'string' ? product.description : null,
        price:       isFinite(price ?? NaN) ? (price ?? 0) : 0,
        status:      'draft',
        metadata:    { source: 'ai_autofill' } as never,
      } as never)

      existingNames.add(name.toLowerCase())
      createdCount++
    }

    await markApplied(db, suggestion.id, ctx)
    return buildChange(ctx, suggestion.id, 'store_product', null, null, { created: createdCount })
  }

  // No store — create a feature_grid section as a product/menu showcase
  return applySectionSuggestion(
    { ...suggestion, suggestion_type: 'services' },
    ctx,
    homePageId,
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOrCreateHomePage(tenantId: string): Promise<string> {
  const db = getSupabaseServerClient()

  const { data: home } = await db
    .from('site_pages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('page_type', 'home')
    .maybeSingle()

  if (home?.id) return home.id

  // Check any page
  const { data: first } = await db
    .from('site_pages')
    .select('id')
    .eq('tenant_id', tenantId)
    .neq('status', 'archived')
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (first?.id) return first.id

  // Create home page
  const { data: created } = await db
    .from('site_pages')
    .insert({
      tenant_id:  tenantId,
      slug:       '',
      title:      'Home',
      page_type:  'home',
      status:     'draft',
      sort_order: 0,
    })
    .select('id')
    .single()

  if (!created) throw new Error('Could not create home page')
  return (created as { id: string }).id
}

function mergeContent(
  sectionType:  string,
  existing:     Record<string, unknown>,
  incoming:     Record<string, unknown>,
): Record<string, unknown> {
  if (sectionType === 'testimonials') {
    const existItems = (existing.items as TestimonialsContent['items']) ?? []
    const newItems   = (incoming.items as TestimonialsContent['items']) ?? []
    const filtered   = newItems.filter(
      (ni) => !isDuplicateReview(existItems, ni.name, ni.text)
    )
    return { ...existing, items: [...existItems, ...filtered] }
  }

  if (sectionType === 'feature_grid') {
    const existItems = (existing.items as Array<{ title?: string }>) ?? []
    const newItems   = (incoming.items as Array<{ title?: string }>) ?? []
    const filtered   = newItems.filter(
      (ni) => !isDuplicateService(existItems, ni.title ?? '')
    )
    return { ...existing, items: [...existItems, ...filtered] }
  }

  if (sectionType === 'faq') {
    const existItems = (existing.items as FaqContent['items']) ?? []
    const newItems   = (incoming.items as FaqContent['items']) ?? []
    const filtered   = newItems.filter(
      (ni) => !isDuplicateFaq(existItems, ni.question)
    )
    return { ...existing, items: [...existItems, ...filtered] }
  }

  // For other types, merge at top level, preserving existing keys unless overridden
  return { ...existing, ...incoming }
}

async function markApplied(
  db:           ReturnType<typeof getSupabaseServerClient>,
  suggestionId: string,
  ctx:          ApplyContext,
): Promise<void> {
  await db
    .from('website_ai_suggestions')
    .update({ status: 'applied', applied_at: new Date().toISOString() })
    .eq('id', suggestionId)
    .eq('tenant_id', ctx.tenantId)
}

function buildChange(
  ctx:          ApplyContext,
  suggestionId: string,
  targetType:   AiAppliedChange['target_type'],
  targetId:     string | null,
  before:       Record<string, unknown> | null,
  after:        Record<string, unknown>,
): AiAppliedChange {
  return {
    id:              '',
    tenant_id:       ctx.tenantId,
    job_id:          ctx.jobId,
    suggestion_id:   suggestionId,
    applied_by:      ctx.appliedBy,
    target_type:     targetType,
    target_id:       targetId,
    before_snapshot: before,
    after_snapshot:  after,
    created_at:      new Date().toISOString(),
  }
}
