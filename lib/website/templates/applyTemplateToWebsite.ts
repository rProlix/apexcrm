// lib/website/templates/applyTemplateToWebsite.ts
// Core template engine — applies a template to a tenant's draft website.
// Preserves all existing content. Does not publish automatically.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getTemplate } from './templateRegistry'
import { mapContentToTemplate, buildPlaceholderContent } from './mapContentToTemplate'
import type { ExistingSection } from './mapContentToTemplate'
import type { TemplateApplyOptions, MappedSection } from './templateTypes'
import { createWebsiteVersion } from '@/lib/website/versioning'

export interface TemplateApplyResult {
  ok:                    boolean
  templateApplicationId: string
  beforeVersionId:       string
  afterVersionId:        string
  sectionsUpdated:       number
  sectionsCreated:       number
  previewUrl:            string
  message:               string
  error?:                string
}

export async function applyTemplateToWebsite(
  opts: TemplateApplyOptions,
): Promise<TemplateApplyResult> {
  const {
    tenantId,
    templateKey,
    preserveBrand,
    preserveImages,
    generateMissingImages: _generateImages,
    applyAnimations,
    pageId: requestedPageId,
  } = opts

  const db = getSupabaseServerClient()

  // ── 1. Load template definition ────────────────────────────────────────────
  const template = getTemplate(templateKey)
  if (!template) {
    return {
      ok: false,
      templateApplicationId: '',
      beforeVersionId: '',
      afterVersionId: '',
      sectionsUpdated: 0,
      sectionsCreated: 0,
      previewUrl: '',
      message: `Template "${templateKey}" not found.`,
      error: 'TEMPLATE_NOT_FOUND',
    }
  }

  // ── 2. Load tenant + page ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenantRow } = await (db as any)
    .from('tenants')
    .select('slug, name')
    .eq('id', tenantId)
    .maybeSingle() as { data: { slug: string; name: string } | null; error: unknown }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pages } = await (db as any)
    .from('site_pages')
    .select('id, slug')
    .eq('tenant_id', tenantId)
    .neq('status', 'archived')
    .order('sort_order', { ascending: true }) as { data: { id: string; slug: string }[] | null; error: unknown }

  const activePage = requestedPageId
    ? (pages ?? []).find((p) => p.id === requestedPageId)
    : (pages ?? [])[0]

  if (!activePage) {
    return {
      ok: false, templateApplicationId: '', beforeVersionId: '', afterVersionId: '',
      sectionsUpdated: 0, sectionsCreated: 0, previewUrl: '',
      message: 'No active page found for this tenant.',
      error: 'NO_PAGE',
    }
  }

  // ── 3. Load current sections ───────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawSections } = await (db as any)
    .from('site_sections')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('page_id', activePage.id)
    .order('sort_order', { ascending: true }) as { data: ExistingSection[] | null; error: unknown }

  const existingSections: ExistingSection[] = rawSections ?? []

  // ── 4. Create before checkpoint ───────────────────────────────────────────
  const beforeVersionResult = await createWebsiteVersion({
    tenantId,
    source:      'before_template_apply' as never,
    label:       `Before template: ${template.name}`,
    description: `Checkpoint before applying template "${templateKey}"`,
  })
  const beforeVersionId = beforeVersionResult.data?.id ?? ''

  // ── 5. Map sections to template slots ─────────────────────────────────────
  const mappings = mapContentToTemplate(existingSections, template.sectionBlueprints)

  // ── 6. Load current site_settings for brand preservation ──────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settingsRow } = await (db as any)
    .from('site_settings')
    .select('theme, design_system')
    .eq('tenant_id', tenantId)
    .maybeSingle() as { data: { theme?: Record<string, unknown>; design_system?: Record<string, unknown> } | null; error: unknown }

  // Build new design system — optionally preserve brand colors
  const templateDs = template.designSystem as Record<string, unknown>
  let newDesignSystem: Record<string, unknown> = { ...templateDs }
  if (preserveBrand && settingsRow?.theme) {
    const existingTheme = settingsRow.theme as Record<string, unknown>
    const existingPalette = (settingsRow.design_system as Record<string, unknown> | null)?.palette as Record<string, unknown> | null ?? null
    newDesignSystem = {
      ...newDesignSystem,
      palette: {
        ...(templateDs.palette as Record<string, unknown> ?? {}),
        // Preserve primary + accent from existing brand
        ...(existingPalette ? { primary: existingPalette.primary, accent: existingPalette.accent } : {}),
        ...(existingTheme.primaryColor ? { primary: existingTheme.primaryColor } : {}),
      },
    }
  }

  // ── 7. Build animation config for template ────────────────────────────────
  function buildAnimConfig(level: string) {
    if (!applyAnimations || level === 'none') return null
    const baseDuration = level === 'cinematic' ? 0.9 : level === 'balanced' ? 0.6 : 0.4
    return {
      enabled:  true,
      style:    level === 'cinematic' ? 'fade_up' : 'fade',
      duration: baseDuration,
      delay:    0,
      easing:   'ease_out',
    }
  }
  const templateAnimConfig = buildAnimConfig(template.animationLevel)

  // ── 8. Apply each mapped slot ─────────────────────────────────────────────
  let sectionsUpdated = 0
  let sectionsCreated = 0
  const finalMappedSections: MappedSection[] = []

  for (const mapping of mappings) {
    const { blueprint, existing, shouldCreate } = mapping
    const design = blueprint.design

    // Build the new style_config — merge with existing to preserve animation sub-key
    const existingStyleConfig = existing?.style_config && typeof existing.style_config === 'object'
      ? existing.style_config as Record<string, unknown>
      : {}
    const newStyleConfig: Record<string, unknown> = {
      ...existingStyleConfig,
      design: design,
      // Preserve existing images if requested
      ...(preserveImages && existingStyleConfig.backgroundImage ? { backgroundImage: existingStyleConfig.backgroundImage } : {}),
    }

    // Animation config
    const animConfig = applyAnimations && templateAnimConfig
      ? { ...templateAnimConfig }
      : (existing?.animation_config ?? null)

    if (existing) {
      // Update existing section
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .from('site_sections')
        .update({
          sort_order:      blueprint.order,
          template_slot:   blueprint.slot,
          style_config:    newStyleConfig,
          animation_config: animConfig,
          updated_at:      new Date().toISOString(),
        } as never)
        .eq('id', existing.id)

      finalMappedSections.push({
        id:             existing.id,
        section_type:   existing.section_type,
        template_slot:  blueprint.slot,
        sort_order:     blueprint.order,
        content:        existing.content,
        style_config:   newStyleConfig,
        animation_config: animConfig,
        is_visible:     existing.is_visible,
        isNew:          false,
      })
      sectionsUpdated++
    } else if (shouldCreate) {
      // Create placeholder section
      const newContent = buildPlaceholderContent(blueprint.sectionType, blueprint)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: created } = await (db as any)
        .from('site_sections')
        .insert({
          tenant_id:       tenantId,
          page_id:         activePage.id,
          section_type:    blueprint.sectionType,
          section_key:     `${blueprint.slot}_placeholder`,
          content:         newContent,
          sort_order:      blueprint.order,
          template_slot:   blueprint.slot,
          style_config:    { design },
          animation_config: animConfig,
          is_visible:      true,
        } as never)
        .select('id')
        .single() as { data: { id: string } | null; error: unknown }

      if (created) {
        finalMappedSections.push({
          id:             created.id,
          section_type:   blueprint.sectionType,
          template_slot:  blueprint.slot,
          sort_order:     blueprint.order,
          content:        newContent,
          style_config:   { design },
          animation_config: animConfig,
          is_visible:     true,
          isNew:          true,
        })
        sectionsCreated++
      }
    }
  }

  // ── 9. Hide sections that didn't map to any slot ──────────────────────────
  const mappedExistingIds = new Set(
    mappings.filter((m) => m.existing).map((m) => m.existing!.id),
  )
  const unmappedSections = existingSections.filter((s) => !mappedExistingIds.has(s.id))

  if (unmappedSections.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)
      .from('site_sections')
      .update({ is_visible: false, sort_order: 999 } as never)
      .in('id', unmappedSections.map((s) => s.id))
  }

  // ── 10. Update site_settings with new template and design system ───────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('site_settings')
    .update({
      active_template_key: templateKey,
      design_system:       newDesignSystem,
      template_config:     {
        templateKey,
        appliedAt:      new Date().toISOString(),
        preserveBrand,
        preserveImages,
        applyAnimations,
      },
      updated_at: new Date().toISOString(),
    } as never)
    .eq('tenant_id', tenantId)

  // ── 11. Create after checkpoint ────────────────────────────────────────────
  const afterVersionResult = await createWebsiteVersion({
    tenantId,
    source:      'template_apply' as never,
    label:       `Template applied: ${template.name}`,
    description: `Applied template "${templateKey}" — ${sectionsUpdated} updated, ${sectionsCreated} created`,
  })
  const afterVersionId = afterVersionResult.data?.id ?? ''

  // ── 12. Log the template application ──────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: appLog } = await (db as any)
    .from('website_template_applications')
    .insert({
      tenant_id:              tenantId,
      template_key:           templateKey,
      previous_version_id:    beforeVersionId || null,
      new_version_id:         afterVersionId  || null,
      preserve_brand:         preserveBrand,
      preserve_images:        preserveImages,
      generate_missing_images: _generateImages,
      apply_animations:       applyAnimations,
      status:                 'applied',
    } as never)
    .select('id')
    .single() as { data: { id: string } | null; error: unknown }

  const slug = tenantRow?.slug ?? tenantId
  const previewUrl = `/sites/${slug}`

  return {
    ok:                    true,
    templateApplicationId: appLog?.id ?? '',
    beforeVersionId,
    afterVersionId,
    sectionsUpdated,
    sectionsCreated,
    previewUrl,
    message:               `Template "${template.name}" applied — ${sectionsUpdated} sections updated, ${sectionsCreated} created.`,
  }
}

// ── Preview (dry-run, no DB writes) ──────────────────────────────────────────

export async function previewTemplate(
  tenantId:    string,
  templateKey: string,
  pageId?:     string | null,
): Promise<{
  ok:        boolean
  template:  ReturnType<typeof getTemplate>
  mappings:  Array<{ slot: string; sectionType: string; hasContent: boolean; order: number }>
  error?:    string
}> {
  const template = getTemplate(templateKey)
  if (!template) return { ok: false, template: null, mappings: [], error: 'TEMPLATE_NOT_FOUND' }

  const db = getSupabaseServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pages } = await (db as any)
    .from('site_pages')
    .select('id')
    .eq('tenant_id', tenantId)
    .neq('status', 'archived')
    .order('sort_order', { ascending: true })
    .limit(1) as { data: { id: string }[] | null; error: unknown }

  const page = pageId
    ? { id: pageId }
    : (pages ?? [])[0]

  if (!page) return { ok: false, template, mappings: [], error: 'NO_PAGE' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sections } = await (db as any)
    .from('site_sections')
    .select('id, section_type, content, sort_order, is_visible, style_config, animation_config')
    .eq('tenant_id', tenantId)
    .eq('page_id', page.id) as { data: ExistingSection[] | null; error: unknown }

  const mappings = mapContentToTemplate(sections ?? [], template.sectionBlueprints)

  return {
    ok:       true,
    template,
    mappings: mappings.map((m) => ({
      slot:        m.blueprint.slot,
      sectionType: m.blueprint.sectionType,
      hasContent:  !!m.existing,
      order:       m.blueprint.order,
    })),
  }
}
