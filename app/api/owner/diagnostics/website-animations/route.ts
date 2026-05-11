// app/api/owner/diagnostics/website-animations/route.ts
// GET /api/owner/diagnostics/website-animations
// Diagnostics for the AI Premium Animation system.

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export async function GET() {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabaseServerClient()
  const report: Record<string, unknown> = {}

  // ── Schema checks ─────────────────────────────────────────────────────────
  const tables = ['website_animation_plans', 'site_sections', 'site_pages', 'tenants']
  const tableChecks: Record<string, { exists: boolean; columns: string[] }> = {}

  for (const tbl of tables) {
    // Use information_schema via a supported query approach
    let exists = false
    try {
      // Try selecting 1 row — if table exists this works, otherwise Supabase throws PGRST116 or similar
      const { error } = await supabase.from(tbl as never).select('id').limit(1)
      exists = !error || !error.message?.includes('does not exist')
    } catch { exists = false }
    tableChecks[tbl] = { exists, columns: [] }
  }

  // Check specific columns on site_sections
  const animCols = ['animation_config', 'style_config']
  for (const col of animCols) {
    try {
      const { error } = await supabase
        .from('site_sections')
        .select(col)
        .limit(1)
      if (!error) tableChecks.site_sections.columns.push(col)
    } catch { /* column missing */ }
  }

  // Check website_animation_config column on tenants
  try {
    const { error } = await supabase
      .from('tenants')
      .select('website_animation_config')
      .limit(1)
    if (!error) tableChecks.tenants.columns.push('website_animation_config')
  } catch { /* missing */ }

  report.schema = tableChecks

  // ── RLS check (proxy: table exists = assumed RLS configured by migration) ──
  report.rlsEnabled = tableChecks.website_animation_plans?.exists ?? false

  // ── Plan counts by status ─────────────────────────────────────────────────
  try {
    const { data: plans } = await supabase
      .from('website_animation_plans')
      .select('status')
      .eq('tenant_id', ctx.tenant_id ?? '') as { data: Array<{ status: string }> | null; error: unknown }

    const counts: Record<string, number> = {}
    for (const p of plans ?? []) {
      counts[p.status] = (counts[p.status] ?? 0) + 1
    }
    report.planCountsByStatus = counts
  } catch {
    report.planCountsByStatus = null
  }

  // ── Sample animation configs ───────────────────────────────────────────────
  try {
    const { data: samples } = await supabase
      .from('website_animation_plans')
      .select('id, status, scope, ai_plan, animation_config, created_at')
      .eq('tenant_id', ctx.tenant_id ?? '')
      .order('created_at', { ascending: false })
      .limit(3)
    report.recentPlans = samples ?? []
  } catch {
    report.recentPlans = []
  }

  // ── Environment variables ──────────────────────────────────────────────────
  report.env = {
    GEMINI_API_KEY_SET:        !!process.env.GEMINI_API_KEY,
    GEMINI_ANIMATION_MODEL:    process.env.GEMINI_ANIMATION_MODEL ?? '(not set — using default)',
    WEBSITE_AI_GEMINI_MODEL:   process.env.WEBSITE_AI_GEMINI_MODEL ?? '(not set)',
  }

  // ── Framer Motion installed ───────────────────────────────────────────────
  let framerMotionInstalled = false
  try {
    require.resolve('framer-motion')
    framerMotionInstalled = true
  } catch { /* not installed */ }
  report.framerMotionInstalled = framerMotionInstalled

  // ── Malformed animation_config rows ──────────────────────────────────────
  try {
    const { data: sections } = await supabase
      .from('site_sections')
      .select('*')
      .eq('tenant_id', ctx.tenant_id ?? '')
      .limit(50) as { data: Array<Record<string, unknown>> | null; error: unknown }

    const malformed: string[] = []
    for (const s of sections ?? []) {
      const cfg = s.animation_config
      if (cfg && typeof cfg === 'object') {
        const o = cfg as Record<string, unknown>
        if (!('v' in o)) malformed.push(String(s.id))
      }
    }
    report.malformedAnimationConfigCount = malformed.length
    report.malformedSectionIds = malformed.slice(0, 5)
  } catch {
    report.malformedAnimationConfigCount = null
  }

  // ── Overall health ────────────────────────────────────────────────────────
  const allTablesExist = tables.every(t => tableChecks[t]?.exists)
  const sectionCols    = tableChecks.site_sections?.columns ?? []
  const hasAnimCol     = sectionCols.includes('animation_config')

  const envReport = report.env as Record<string, unknown>
  const ok = allTablesExist && hasAnimCol && framerMotionInstalled && !!envReport.GEMINI_API_KEY_SET

  return NextResponse.json({
    ok,
    report,
    fixes: [
      !allTablesExist && 'Run supabase/migrations/063_website_animations.sql in your Supabase SQL editor.',
      !hasAnimCol     && 'Run supabase/migrations/063_website_animations.sql to add animation_config column to site_sections.',
      !envReport.GEMINI_API_KEY_SET && 'Set GEMINI_API_KEY environment variable.',
      !framerMotionInstalled && 'Run: npm install framer-motion',
    ].filter(Boolean),
  }, { status: ok ? 200 : 207 })
}
