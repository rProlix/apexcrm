// lib/website-import/saveDraftSiteFromImport.ts
// Writes a DraftSiteConfig into the website builder tables as a new DRAFT.
// Never touches the published site — all pages/sections get status='draft'.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { DraftSiteConfig, DraftPage, DraftSection, NormalizedImportContent } from './types'

export interface SaveDraftResult {
  siteSettingsId:  string
  pageIds:         string[]
  sectionIds:      string[]
  importResultIds: string[]
}

/**
 * Persist a full DraftSiteConfig from an import job.
 *
 * Flow:
 *  1. Upsert site_settings (draft fields only — never flip is_published)
 *  2. Insert draft pages
 *  3. Insert sections per page
 *  4. Insert site_assets for images
 *  5. Update the import job with target_site_id
 *  6. Save import results for owner review
 */
export async function saveDraftSiteFromImport(
  tenantId: string,
  jobId:    string,
  config:   DraftSiteConfig,
  content:  NormalizedImportContent,
): Promise<SaveDraftResult> {
  const db = getSupabaseServerClient() as any

  // ── 1. Upsert site_settings (preserve is_published) ───────────────────────

  const { data: existing } = await db
    .from('site_settings')
    .select('id, is_published')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  const settingsPayload: Record<string, unknown> = {
    tenant_id:    tenantId,
    is_published: existing?.is_published ?? false,
  }

  if (config.settings.site_name)   settingsPayload.site_name   = config.settings.site_name
  if (config.settings.logo_url)    settingsPayload.logo_url    = config.settings.logo_url
  if (config.settings.favicon_url) settingsPayload.favicon_url = config.settings.favicon_url
  if (config.settings.brand_colors) settingsPayload.brand_colors = config.settings.brand_colors
  if (config.settings.seo_defaults)  settingsPayload.seo_defaults  = config.settings.seo_defaults
  if (config.settings.footer_config) settingsPayload.footer_config = config.settings.footer_config

  const { data: settings, error: settingsErr } = await db
    .from('site_settings')
    .upsert(settingsPayload, { onConflict: 'tenant_id' })
    .select('id')
    .single()

  if (settingsErr || !settings) {
    throw new Error(settingsErr?.message ?? 'Failed to upsert site_settings')
  }

  // ── 2. Insert draft pages + sections ─────────────────────────────────────

  const pageIds:    string[] = []
  const sectionIds: string[] = []

  for (let i = 0; i < config.pages.length; i++) {
    const draftPage = config.pages[i]

    // Check if a page with this slug already exists (don't duplicate)
    const { data: existingPage } = await db
      .from('site_pages')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('slug', draftPage.slug)
      .maybeSingle()

    let pageId: string

    if (existingPage?.id) {
      // Update existing draft page title/meta but don't overwrite if published
      await db
        .from('site_pages')
        .update({
          title:            draftPage.title,
          meta_description: draftPage.meta_description,
          status:           'draft',
          sort_order:       i,
        })
        .eq('id', existingPage.id)
        .neq('status', 'published')  // Never auto-downgrade published pages

      pageId = existingPage.id
    } else {
      const { data: newPage, error: pageErr } = await db
        .from('site_pages')
        .insert({
          tenant_id:        tenantId,
          slug:             draftPage.slug,
          title:            draftPage.title,
          meta_description: draftPage.meta_description,
          page_type:        draftPage.page_type,
          status:           'draft',
          sort_order:       i,
        })
        .select('id')
        .single()

      if (pageErr || !newPage) {
        console.error('[saveDraft] page insert error:', pageErr?.message)
        continue
      }
      pageId = newPage.id
    }

    pageIds.push(pageId)

    // Insert sections for this page
    const insertedSectionIds = await upsertSections(db, tenantId, pageId, draftPage.sections)
    sectionIds.push(...insertedSectionIds)
  }

  // ── 3. Save site_assets for images ────────────────────────────────────────

  if (content.images.length > 0) {
    const assetRows = content.images.slice(0, 20).map((img) => ({
      tenant_id:  tenantId,
      asset_type: 'image',
      url:        img.url,
      metadata:   { alt: img.alt, source: 'import', job_id: jobId },
    }))

    await db.from('site_assets').upsert(assetRows, { onConflict: 'url' }).select('id')
  }

  // ── 4. Update import job with target site ─────────────────────────────────

  await db
    .from('website_import_jobs')
    .update({
      target_site_id: settings.id,
      status:         'completed',
      progress:       100,
      completed_at:   new Date().toISOString(),
    })
    .eq('id', jobId)

  // ── 5. Save structured import results for review ──────────────────────────

  const importResultIds = await saveImportResults(db, tenantId, jobId, content)

  // ── 6. Audit ──────────────────────────────────────────────────────────────

  await db.from('website_import_audit').insert({
    tenant_id: tenantId,
    job_id:    jobId,
    action:    'draft_saved',
    metadata:  {
      pages_created:    pageIds.length,
      sections_created: sectionIds.length,
      site_settings_id: settings.id,
    },
  })

  return {
    siteSettingsId:  settings.id,
    pageIds,
    sectionIds,
    importResultIds,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsertSections(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  tenantId:  string,
  pageId:    string,
  sections:  DraftSection[],
): Promise<string[]> {
  const ids: string[] = []

  for (const section of sections) {
    // Check for existing section with same key
    const { data: existing } = await db
      .from('site_sections')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('page_id', pageId)
      .eq('section_key', section.section_key)
      .maybeSingle()

    if (existing?.id) {
      await db
        .from('site_sections')
        .update({
          content:    section.content,
          sort_order: section.sort_order,
          is_visible: true,
        })
        .eq('id', existing.id)

      ids.push(existing.id)
    } else {
      const { data: newSection, error } = await db
        .from('site_sections')
        .insert({
          tenant_id:    tenantId,
          page_id:      pageId,
          section_type: section.section_type,
          section_key:  section.section_key,
          content:      section.content,
          sort_order:   section.sort_order,
          is_visible:   true,
        })
        .select('id')
        .single()

      if (!error && newSection) ids.push(newSection.id)
    }
  }

  return ids
}

async function saveImportResults(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  tenantId: string,
  jobId:    string,
  content:  NormalizedImportContent,
): Promise<string[]> {
  const fieldMappings: Array<{
    key: string
    section: string
    value: unknown
  }> = [
    { key: 'businessName',   section: 'site_settings',   value: content.businessName },
    { key: 'description',    section: 'hero/about',       value: content.description },
    { key: 'logoUrl',        section: 'site_settings',    value: content.logoUrl },
    { key: 'faviconUrl',     section: 'site_settings',    value: content.faviconUrl },
    { key: 'phone',          section: 'contact',          value: content.phone },
    { key: 'email',          section: 'contact',          value: content.email },
    { key: 'address',        section: 'contact',          value: content.address },
    { key: 'hours',          section: 'contact/footer',   value: content.hours },
    { key: 'socialLinks',    section: 'footer',           value: content.socialLinks },
    { key: 'services',       section: 'feature_grid',     value: content.services },
    { key: 'testimonials',   section: 'testimonials',     value: content.testimonials },
    { key: 'faqItems',       section: 'faq',              value: content.faqItems },
    { key: 'images',         section: 'gallery/hero',     value: content.images },
    { key: 'brandColors',    section: 'site_settings',    value: content.brandColors },
    { key: 'seoTitle',       section: 'page_meta',        value: content.seoTitle },
    { key: 'seoDescription', section: 'page_meta',        value: content.seoDescription },
    { key: 'mapUrl',         section: 'contact',          value: content.mapUrl },
    { key: 'latitude',       section: 'contact',          value: content.latitude },
    { key: 'longitude',      section: 'contact',          value: content.longitude },
  ].filter((f) => f.value != null && f.value !== '' && !(Array.isArray(f.value) && (f.value as unknown[]).length === 0))

  const rows = fieldMappings.map((f) => ({
    tenant_id:       tenantId,
    job_id:          jobId,
    result_key:      f.key,
    mapped_section:  f.section,
    result_value:    f.value as Record<string, unknown>,
    confidence_score: content.confidenceMap[f.key] ?? 0.5,
    approved:        false,
  }))

  if (rows.length === 0) return []

  const { data, error } = await db
    .from('website_import_results')
    .insert(rows)
    .select('id')

  if (error) console.error('[saveImportResults] error:', error.message)

  return (data ?? []).map((r: { id: string }) => r.id)
}
