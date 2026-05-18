// app/api/website/sections/[sectionId]/animation/route.ts
// POST — save manual animation_config and style_config for a section.
// Validates the incoming config before writing to Supabase.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { sectionAnimationConfigSchema } from '@/lib/website/animations/validateAnimationConfig'

type RouteContext = {
  params: Promise<{ sectionId: string }>
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { sectionId } = await context.params

  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabaseServerClient()

  // Verify section exists and belongs to tenant
  const { data: sectionRow } = await supabase
    .from('site_sections')
    .select('id, tenant_id')
    .eq('id', sectionId)
    .maybeSingle()

  if (!sectionRow)
    return NextResponse.json({ error: 'Section not found.' }, { status: 404 })

  if (ctx.role !== 'owner' && ctx.tenant_id !== sectionRow.tenant_id)
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })

  // Parse body
  let body: { animation_config?: unknown; style_config?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }) }

  // Validate animation config with Zod
  const rawAnimConfig = body.animation_config ?? {}
  const parsedResult  = sectionAnimationConfigSchema.safeParse(rawAnimConfig)
  if (!parsedResult.success) {
    return NextResponse.json({
      error:  'Invalid animation_config.',
      detail: parsedResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
    }, { status: 400 })
  }

  const validatedConfig = parsedResult.data

  // Load existing style_config so we can merge — never clobber style_config.design
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingRow } = await (supabase as any)
    .from('site_sections')
    .select('style_config')
    .eq('id', sectionId)
    .single() as { data: { style_config?: Record<string, unknown> } | null; error: unknown }

  const existingStyleConfig =
    existingRow?.style_config && typeof existingRow.style_config === 'object'
      ? existingRow.style_config
      : {}

  // Merge: preserve existing style_config.design; set animation sub-key only
  const mergedStyleConfig: Record<string, unknown> = {
    ...existingStyleConfig,
    animation: validatedConfig,
  }

  // Update section — animation_config is the canonical animation store;
  // style_config merges animation without erasing design fields.
  const { data: updated, error: updateErr } = await supabase
    .from('site_sections')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({
      animation_config: validatedConfig as never,
      style_config:     mergedStyleConfig as never,
      updated_at:       new Date().toISOString(),
    } as never)
    .eq('id', sectionId)
    .select('id, section_type, animation_config, style_config')
    .single()

  if (updateErr) {
    console.error('[section-animation] update error:', updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, section: updated })
}

// GET — read current animation config for a section
export async function GET(_req: NextRequest, context: RouteContext) {
  const { sectionId } = await context.params

  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('site_sections')
    .select('id, section_type, animation_config, style_config')
    .eq('id', sectionId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Section not found.' }, { status: 404 })

  if (ctx.role !== 'owner' && ctx.tenant_id !== (data as unknown as Record<string, unknown>).tenant_id)
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })

  return NextResponse.json({ section: data })
}
