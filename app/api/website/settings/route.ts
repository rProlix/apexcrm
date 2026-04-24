// app/api/website/settings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

function resolveTenantId(ctx: Awaited<ReturnType<typeof getUserContext>>, override?: string | null): string | null {
  if (!ctx) return null
  const hint = sanitizeTenantId(override)
  const self = sanitizeTenantId(ctx.tenant_id)
  if (ctx.role === 'owner') return hint ?? self
  if (self && hint && self !== hint) return null // mismatch → deny
  return self ?? hint
}

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const url      = new URL(req.url)
  const override = url.searchParams.get('tenant_id') ?? undefined
  const tenantId = resolveTenantId(ctx, override)
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const db = getSupabaseServerClient()
  const { data, error } = await db
    .from('site_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const body     = await req.json()
  const tenantId = resolveTenantId(ctx, body.tenant_id)
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const allowed = [
    'site_name', 'logo_url', 'favicon_url',
    'brand_colors', 'fonts', 'theme',
    'seo_defaults', 'header_config', 'footer_config',
    'custom_domain', 'subdomain',
  ]
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }

  const db = getSupabaseServerClient()
  const { data, error } = await db
    .from('site_settings')
    .upsert({ tenant_id: tenantId, ...patch }, { onConflict: 'tenant_id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data })
}
