export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  completeScrollExperienceUpload,
  recordScrollAudit,
  resolveScrollTenant,
} from '@/lib/website-scroll-experience/server'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ experienceId: string }> }
) {
  const ctx = await getUserContext()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const tenantId = await resolveScrollTenant(ctx, body.tenantId)
  if (!ctx || !tenantId)
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  const { experienceId } = await context.params
  const db = getSupabaseServerClient() as SupabaseClient
  const { data: version } = await db
    .from('website_scroll_experience_versions')
    .select('id,status')
    .eq('experience_id', experienceId)
    .eq('tenant_id', tenantId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!version || version.status !== 'FAILED') {
    return NextResponse.json(
      { ok: false, error: 'Only a failed processing version can be retried.' },
      { status: 409 }
    )
  }
  await db
    .from('website_scroll_experience_jobs')
    .update({ status: 'QUEUED', queue_message_id: null, last_error_category: null })
    .eq('experience_version_id', version.id)
    .eq('tenant_id', tenantId)
  await db
    .from('website_scroll_experience_versions')
    .update({ status: 'UPLOADED', processing_error_category: null })
    .eq('id', version.id)
    .eq('tenant_id', tenantId)
  await recordScrollAudit(tenantId, experienceId, 'SCROLL_VIDEO_RETRY_STARTED', ctx.id)
  try {
    const result = await completeScrollExperienceUpload({
      tenantId,
      actorId: ctx.id,
      experienceId,
      experienceVersionId: version.id,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Retry failed.' },
      { status: 400 }
    )
  }
}
