// app/api/website/ai/animations/disable/route.ts
// POST /api/website/ai/animations/disable
// Clears animation configs for a given scope without deleting plan history.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const bodySchema = z.object({
  tenantId:  z.string().uuid(),
  pageId:    z.string().uuid().optional().nullable(),
  sectionId: z.string().uuid().optional().nullable(),
  scope:     z.enum(['global', 'page', 'section']),
  planId:    z.string().uuid().optional().nullable(),
})

const EMPTY_CONFIG = { v: 1, enabled: false }

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: z.infer<typeof bodySchema>
  try { body = bodySchema.parse(await req.json()) }
  catch (err) { return NextResponse.json({ error: 'Invalid body', detail: String(err) }, { status: 400 }) }

  const { tenantId, pageId, sectionId, scope, planId } = body
  const supabase = getSupabaseServerClient()

  // Verify tenant access
  const { data: userRow } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('auth_user_id', ctx.auth_id)
    .single()
  if (!userRow || userRow.tenant_id !== tenantId)
    return NextResponse.json({ error: 'Tenant access denied.' }, { status: 403 })

  const now = new Date().toISOString()

  if (scope === 'section' && sectionId) {
    await supabase
      .from('site_sections')
      .update({ animation_config: EMPTY_CONFIG as never, style_config: EMPTY_CONFIG as never, updated_at: now } as never)
      .eq('id', sectionId)
  }

  if (scope === 'page' && pageId) {
    await supabase
      .from('site_pages')
      .update({ animation_config: EMPTY_CONFIG as never, style_config: EMPTY_CONFIG as never, updated_at: now } as never)
      .eq('id', pageId)
    // Also clear sections on this page
    await supabase
      .from('site_sections')
      .update({ animation_config: EMPTY_CONFIG as never, style_config: EMPTY_CONFIG as never, updated_at: now } as never)
      .eq('page_id', pageId)
  }

  if (scope === 'global') {
    await supabase
      .from('tenants')
      .update({ website_animation_config: EMPTY_CONFIG as never } as never)
      .eq('id', tenantId)
    // Clear all sections for this tenant
    await supabase
      .from('site_sections')
      .update({ animation_config: EMPTY_CONFIG as never, style_config: EMPTY_CONFIG as never, updated_at: now } as never)
      .eq('tenant_id', tenantId)
    // Clear all pages
    await supabase
      .from('site_pages')
      .update({ animation_config: EMPTY_CONFIG as never, style_config: EMPTY_CONFIG as never, updated_at: now } as never)
      .eq('tenant_id', tenantId)
  }

  // Mark the plan as disabled if provided
  if (planId) {
    await supabase
      .from('website_animation_plans')
      .update({ status: 'disabled', disabled_at: now, updated_at: now } as never)
      .eq('id', planId)
  }

  return NextResponse.json({ ok: true, scope, message: 'Animations disabled.' })
}
