// app/api/website/versions/[versionId]/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getWebsiteVersion } from '@/lib/website/versioning'
import { getSupabaseServerClient } from '@/lib/supabase/server'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

type RouteContext = { params: Promise<{ versionId: string }> }

export async function GET(_req: NextRequest, context: RouteContext) {
  const { versionId } = await context.params
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()
  if (!ctx.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const result = await getWebsiteVersion(ctx.tenant_id, versionId)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 404 })

  return NextResponse.json({ version: result.data })
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { versionId } = await context.params
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()
  if (!ctx.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const allowed = ['label', 'description', 'status']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseServerClient() as any
  const { data, error } = await db
    .from('site_versions')
    .update(patch)
    .eq('id', versionId)
    .eq('tenant_id', ctx.tenant_id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ version: data })
}
