// app/api/settings/tenant/route.ts
// GET/PATCH tenant branding, name, industry, and basic profile.
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function GET() {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()
  if (!ctx.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const db = getSupabaseServerClient()
  const { data, error } = await db
    .from('tenants')
    .select('id, name, slug, subdomain, custom_domain, branding, status, created_at')
    .eq('id', ctx.tenant_id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tenant: data })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()
  if (!ctx.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const db = getSupabaseServerClient()

  // Fetch current branding to merge
  const { data: current } = await db
    .from('tenants')
    .select('branding')
    .eq('id', ctx.tenant_id)
    .single()

  const currentBranding = (current?.branding ?? {}) as Record<string, unknown>

  // Build update payload — only allow safe fields
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.name === 'string' && body.name.trim()) {
    update.name = body.name.trim()
  }

  // Merge branding JSONB fields
  const brandingPatch: Record<string, unknown> = {}
  const brandingFields = ['primary_color', 'logo_url', 'favicon_url', 'accent', 'industry', 'tagline', 'support_email', 'support_phone', 'address']
  for (const key of brandingFields) {
    if (key in body) brandingPatch[key] = body[key]
  }
  if (Object.keys(brandingPatch).length > 0) {
    update.branding = { ...currentBranding, ...brandingPatch }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from('tenants') as any)
    .update(update)
    .eq('id', ctx.tenant_id)
    .select('id, name, slug, subdomain, custom_domain, branding, status, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tenant: data })
}
