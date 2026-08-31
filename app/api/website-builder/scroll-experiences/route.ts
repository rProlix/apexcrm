export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  assertPageOwnership,
  assertScrollExperienceEntitlement,
  createScrollExperienceUpload,
  resolveScrollTenant,
} from '@/lib/website-scroll-experience/server'

function responseError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  const tenantId = await resolveScrollTenant(ctx, req.nextUrl.searchParams.get('tenant_id'))
  if (!ctx || !tenantId) return responseError('Forbidden', 403)
  const db = getSupabaseServerClient() as SupabaseClient
  let query = db
    .from('website_scroll_experiences')
    .select(
      'id,name,status,page_id,component_instance_id,active_version_id,created_at,updated_at,website_scroll_experience_versions!website_scroll_experiences_active_version_fk(id,status,duration_seconds,desktop_bytes,mobile_bytes,processed_at,processing_error_category)'
    )
    .eq('tenant_id', tenantId)
    .neq('status', 'ARCHIVED')
    .order('created_at', { ascending: false })
  const pageId = req.nextUrl.searchParams.get('page_id')
  if (pageId) query = query.eq('page_id', pageId)
  const { data, error } = await query
  if (error) return responseError('Could not load Scroll Experiences.', 500)
  return NextResponse.json({ ok: true, experiences: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const tenantId = await resolveScrollTenant(ctx, body.tenantId)
  if (!ctx || !tenantId) return responseError('Forbidden', 403)
  try {
    await assertScrollExperienceEntitlement(tenantId)
    const pageId = await assertPageOwnership(tenantId, body.pageId)
    const result = await createScrollExperienceUpload({
      tenantId,
      actorId: ctx.id,
      pageId,
      websiteId: typeof body.websiteId === 'string' ? body.websiteId : null,
      componentInstanceId:
        typeof body.componentInstanceId === 'string' ? body.componentInstanceId : null,
      name: typeof body.name === 'string' ? body.name : 'Untitled Scroll Experience',
      fileName: typeof body.fileName === 'string' ? body.fileName : '',
      contentType: typeof body.contentType === 'string' ? body.contentType : '',
      bytes: Number(body.bytes),
    })
    return NextResponse.json({ ok: true, ...result }, { status: 201 })
  } catch (error) {
    return responseError(
      error instanceof Error ? error.message : 'Could not create upload session.'
    )
  }
}
