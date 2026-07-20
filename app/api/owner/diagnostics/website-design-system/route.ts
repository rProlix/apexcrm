// app/api/owner/diagnostics/website-design-system/route.ts
// GET /api/owner/diagnostics/website-design-system
// Returns a health check of the AI design system for the current tenant.

import { NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { normalizeDesignSystem, buildCssVars } from '@/lib/website/design/normalizeDesignSystem'
import { passesWcag } from '@/lib/website/design/contrast'

export async function GET() {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = ctx.tenant_id
  if (!tenantId) return NextResponse.json({ ok: false, error: 'No tenant' }, { status: 400 })

  const db = getSupabaseServerClient()

  // Load site settings
  const { data: settings } = await db
    .from('site_settings')
    .select('theme, brand_colors, fonts, design_system')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // Load sections
  const { data: sections } = await db
    .from('site_sections')
    .select('id, section_type, style_config')
    .eq('tenant_id', tenantId)
    .eq('is_visible', true)

  // Load draft
  const { data: draft } = await db
    .from('website_builder_drafts')
    .select('draft_snapshot, dirty, updated_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  const theme = (settings as Record<string, unknown> | null)?.theme as Record<string, unknown> | null
  const hasDesignSystem = !!(theme && theme.palette)

  let paletteValid     = false
  let typographyValid  = false
  const contrastIssues: string[]  = []
  let normalizedDs: ReturnType<typeof normalizeDesignSystem> | null = null

  if (hasDesignSystem && theme) {
    try {
      const businessCategory = (theme.businessCategory as string) ?? null
      normalizedDs = normalizeDesignSystem(theme, businessCategory)
      paletteValid    = true
      typographyValid = !!(normalizedDs.typography.headingFontStack && normalizedDs.typography.bodyFontStack)

      // Check contrast issues
      const p = normalizedDs.palette
      if (!passesWcag(p.textPrimary,   p.background, 'AA')) {
        contrastIssues.push(`Primary text (${p.textPrimary}) fails AA on background (${p.background})`)
      }
      if (!passesWcag(p.textSecondary, p.background, 'AA')) {
        contrastIssues.push(`Secondary text (${p.textSecondary}) fails AA on background (${p.background})`)
      }
      if (!passesWcag(p.textPrimary, p.surface, 'AA')) {
        contrastIssues.push(`Primary text (${p.textPrimary}) fails AA on surface (${p.surface})`)
      }
    } catch (e) {
      contrastIssues.push(`Design system normalization failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Sections missing design
  const sectionsMissingDesign: string[] = []
  const sectionsWithBadContrast:  string[] = []
  const sectionsUsingFlatBlocks:  string[] = []

  for (const section of sections ?? []) {
    const s = section as unknown as Record<string, unknown>
    const sc = s.style_config as Record<string, unknown> | null
    const design = sc?.design as Record<string, unknown> | null

    if (!design) {
      sectionsMissingDesign.push(`${s.section_type as string} (${(s.id as string).slice(0, 8)})`)
    } else {
      // Check for flat blocks (same white background without dividers)
      const bgType  = design.backgroundType as string
      const divTop  = design.dividerTop as string
      const divBot  = design.dividerBottom as string
      const bgVal   = design.backgroundValue as string

      if (
        bgType === 'solid' &&
        divTop === 'none' && divBot === 'none' &&
        (bgVal === '#ffffff' || bgVal === '#FFFFFF' || bgVal === 'var(--ds-bg')
      ) {
        sectionsUsingFlatBlocks.push(`${s.section_type as string} (${(s.id as string).slice(0, 8)})`)
      }

      // Check text contrast
      const textColor = design.textColor as string | null
      const bgColor   = design.backgroundValue as string | null
      if (textColor && bgColor && textColor.startsWith('#') && bgColor.startsWith('#')) {
        if (!passesWcag(textColor, bgColor, 'AA')) {
          sectionsWithBadContrast.push(`${s.section_type as string}: text ${textColor} on bg ${bgColor}`)
        }
      }
    }
  }

  // Draft design system check
  const draftRaw = draft as unknown as Record<string, unknown> | null
  const draftSnapshot = draftRaw?.draft_snapshot as Record<string, unknown> | null
  const latestDraftHasDesignSystem = !!(draftSnapshot?.settings && (draftSnapshot.settings as Record<string, unknown>)?.designSystem)
  const latestPublishedHasDesignSystem = hasDesignSystem

  const response = {
    ok:                         true,
    tenantId,
    hasDesignSystem,
    paletteValid,
    typographyValid,
    designLevel:                normalizedDs?.designLevel ?? null,
    businessCategory:           normalizedDs?.businessCategory ?? null,
    brandMood:                  normalizedDs?.brandMood ?? null,
    cssVarCount:                normalizedDs ? Object.keys(buildCssVars(normalizedDs)).length : 0,
    contrastIssues,
    sectionsMissingDesign,
    sectionsWithBadContrast,
    sectionsUsingFlatBlocks,
    latestDraftHasDesignSystem,
    latestPublishedHasDesignSystem,
    sectionCount:               sections?.length ?? 0,
    sectionsWithDesign:         (sections?.length ?? 0) - sectionsMissingDesign.length,
    draftUpdatedAt:             draftRaw?.updated_at ?? null,
    draftIsDirty:               draftRaw?.dirty ?? false,
  }

  return NextResponse.json(response)
}
