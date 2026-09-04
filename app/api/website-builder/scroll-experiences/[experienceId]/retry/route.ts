export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  assertScrollExperienceEntitlement,
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
    .select('id,status,updated_at')
    .eq('experience_id', experienceId)
    .eq('tenant_id', tenantId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  const updatedAt = version?.updated_at ? Date.parse(String(version.updated_at)) : Number.NaN
  const stale =
    Boolean(version) &&
    !['READY', 'ARCHIVED', 'FAILED'].includes(String(version?.status)) &&
    Number.isFinite(updatedAt) &&
    Date.now() - updatedAt >= 30 * 60 * 1000
  if (!version || (version.status !== 'FAILED' && !stale)) {
    return NextResponse.json(
      { ok: false, error: 'Processing is still active. Retry becomes available after 30 minutes.' },
      { status: 409 }
    )
  }
  await assertScrollExperienceEntitlement(tenantId)
  await db
    .from('website_scroll_experience_jobs')
    .update({
      status: 'QUEUED',
      queue_message_id: null,
      claimed_at: null,
      completed_at: null,
      last_error_category: null,
    })
    .eq('experience_version_id', version.id)
    .eq('tenant_id', tenantId)
  await db
    .from('website_scroll_experience_versions')
    .update({ status: 'UPLOADED', processing_error_category: null, processing_started_at: null })
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
