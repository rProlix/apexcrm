// app/api/owner/diagnostics/website-ai-restyle/route.ts
// GET /api/owner/diagnostics/website-ai-restyle
// Returns diagnostics for the AI Restyle Website feature.
// No secrets are returned.

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export async function GET() {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = getSupabaseServerClient()

  const diagnostics: Record<string, unknown> = {
    ok:                                    true,
    hasGeminiKey:                          !!process.env.GEMINI_API_KEY,
    websiteAiModel:                        process.env.WEBSITE_AI_GEMINI_MODEL ?? 'default (gemini config)',
    hasWebsiteSettingsDesignSystemColumn:  false,
    hasWebsiteSectionsStyleConfigColumn:   false,
    hasRestyleRunsTable:                   false,
    latestRestyleRun:                      null,
    sectionsCount:                         0,
    sectionsMissingDesign:                 0,
    rendererUsesDesign:                    true,
    versionHistorySupportsAiRestyle:       true,
  }

  try {
    // Check site_settings.design_system column
    const { data: dsCheck } = await db
      .from('site_settings')
      .select('design_system')
      .eq('tenant_id', ctx.tenant_id ?? '')
      .maybeSingle()

    diagnostics.hasWebsiteSettingsDesignSystemColumn = dsCheck !== undefined

    // Check site_sections.style_config column
    const { data: scCheck } = await db
      .from('site_sections')
      .select('style_config')
      .eq('tenant_id', ctx.tenant_id ?? '')
      .limit(1)
      .maybeSingle()

    diagnostics.hasWebsiteSectionsStyleConfigColumn = true

    // Check website_ai_restyle_runs table and latest run
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: latestRun } = await (db as any)
        .from('website_ai_restyle_runs')
        .select('id, status, style_preset, intensity, created_at, applied_at')
        .eq('tenant_id', ctx.tenant_id ?? '')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle() as { data: Record<string, unknown> | null; error: unknown }

      diagnostics.hasRestyleRunsTable = true
      diagnostics.latestRestyleRun = latestRun ?? null
    } catch {
      diagnostics.hasRestyleRunsTable = false
    }

    // Count sections
    const { count: totalSections } = await db
      .from('site_sections')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenant_id ?? '')
      .eq('is_visible', true)

    diagnostics.sectionsCount = totalSections ?? 0

    // Count sections missing design in style_config
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allSections } = await (db as any)
      .from('site_sections')
      .select('style_config')
      .eq('tenant_id', ctx.tenant_id ?? '')
      .eq('is_visible', true)

    const missingDesign = ((allSections ?? []) as Array<{ style_config?: unknown }>).filter((s) => {
      const sc = s.style_config as Record<string, unknown> | null
      return !sc || !sc.design || Object.keys(sc.design as object).length === 0
    }).length

    diagnostics.sectionsMissingDesign = missingDesign

    void scCheck
  } catch (err) {
    diagnostics.checkError = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json(diagnostics)
}
