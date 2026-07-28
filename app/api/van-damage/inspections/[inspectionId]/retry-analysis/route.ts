import { NextRequest, NextResponse } from 'next/server'
import {
  assertActiveModule,
  isTenantAdmin,
  requireCommandCenterContext,
} from '@/lib/command-center/context'
import { sendVanDamageJob } from '@/lib/server/aws/sqs'
import { vanDamageJobSchema } from '@/lib/van-damage/contracts'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ inspectionId: string }> }
) {
  const context = await requireCommandCenterContext('use_modules')
  assertActiveModule(context, 'damage_ai')
  if (!isTenantAdmin(context.role)) {
    return NextResponse.json(
      { error: 'An administrator must retry image analysis.' },
      { status: 403 }
    )
  }
  const { inspectionId } = await params
  const body = (await request.json().catch(() => ({}))) as { imageId?: string }
  const db = context.db
  let query = db
    .from('van_damage_jobs')
    .select('id,image_id,payload,status,attempt_count')
    .eq('tenant_id', context.tenantId)
    .eq('inspection_id', inspectionId)
    .eq('job_type', 'image_analysis')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(100)
  if (body.imageId) query = query.eq('image_id', body.imageId)
  const { data: rows, error } = await query
  if (error)
    return NextResponse.json({ error: 'Failed image jobs could not be loaded.' }, { status: 503 })

  const unique = new Map<
    string,
    { id: string; image_id: string; payload: unknown; attempt_count: number }
  >()
  for (const row of rows ?? []) {
    if (row.image_id && !unique.has(row.image_id)) {
      unique.set(row.image_id, {
        id: row.id,
        image_id: row.image_id,
        payload: row.payload,
        attempt_count: row.attempt_count,
      })
    }
  }
  if (!unique.size) {
    return NextResponse.json(
      { error: 'No failed image analyses are available to retry.' },
      { status: 409 }
    )
  }
  const results = []
  for (const row of unique.values()) {
    const parsed = vanDamageJobSchema.safeParse(row.payload)
    if (
      !parsed.success ||
      parsed.data.tenantId !== context.tenantId ||
      parsed.data.imageId !== row.image_id
    ) {
      results.push({ imageId: row.image_id, ok: false })
      continue
    }
    const messageId = await sendVanDamageJob(parsed.data)
    const { error: updateError } = await db
      .from('van_damage_jobs')
      .update({
        status: 'queued',
        sqs_message_id: messageId,
        last_error: null,
        failure_category: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('tenant_id', context.tenantId)
      .eq('image_id', row.image_id)
    if (!updateError) {
      await db
        .from('van_damage_image_analyses')
        .update({
          status: 'queued',
          failure_category: null,
          failure_message: null,
          completed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', context.tenantId)
        .eq('image_id', row.image_id)
      await db.from('activity_logs').insert({
        tenant_id: context.tenantId,
        actor_type: 'user',
        actor_id: context.user.id,
        action: 'van_damage.image_analysis_retry_started',
        entity_type: 'van_damage_inspection',
        entity_id: inspectionId,
        metadata: { image_id: row.image_id, prior_attempt_count: row.attempt_count },
      })
    }
    results.push({ imageId: row.image_id, ok: !updateError })
  }
  const queued = results.filter((result) => result.ok).length
  if (queued > 0) {
    await db.rpc('recalculate_van_damage_inspection_analysis', {
      p_tenant_id: context.tenantId,
      p_inspection_id: inspectionId,
    })
  }
  return NextResponse.json({ ok: queued > 0, queued, failed: results.length - queued })
}
