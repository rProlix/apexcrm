import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolvePlatformOwnerAccess } from '@/lib/auth/platform-owner'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import type { Json } from '@/lib/supabase/types'

export const runtime = 'nodejs'

const businessIdSchema = z.string().uuid()

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ inspectionId: string }> }
) {
  const owner = await resolvePlatformOwnerAccess()
  if (!owner.ok) {
    if (owner.context?.tenant_id) {
      await getVanDamageServiceClient()
        .from('activity_logs')
        .insert({
          tenant_id: owner.context.tenant_id,
          actor_type: 'user',
          actor_id: owner.context.id,
          action: 'van_damage.inspection_metadata_access_rejected',
          entity_type: 'van_damage_inspection',
          metadata: { endpoint: 'inspection_metadata' } as Json,
        })
    }
    return NextResponse.json({ error: owner.error }, { status: owner.status })
  }
  const parsedBusinessId = businessIdSchema.safeParse(
    request.nextUrl.searchParams.get('businessId')
  )
  if (!parsedBusinessId.success) {
    return NextResponse.json({ error: 'A valid business is required' }, { status: 400 })
  }
  const { inspectionId } = await params
  const businessId = parsedBusinessId.data
  const db = getVanDamageServiceClient()
  const [{ data: inspection }, { data: job }, { data: run }] = await Promise.all([
    db
      .from('van_damage_inspections')
      .select(
        'id,tenant_id,business_id,van_id,source,slack_team_id,slack_channel_id,slack_message_ts,image_count,status,created_at,updated_at,completed_at'
      )
      .eq('id', inspectionId)
      .eq('tenant_id', businessId)
      .eq('business_id', businessId)
      .maybeSingle(),
    db
      .from('van_damage_jobs')
      .select('id,status,attempt_count,created_at,started_at,completed_at')
      .eq('inspection_id', inspectionId)
      .eq('tenant_id', businessId)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('van_damage_ai_runs')
      .select('id,status,created_at,completed_at')
      .eq('inspection_id', inspectionId)
      .eq('tenant_id', businessId)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
  }

  await db.from('activity_logs').insert({
    tenant_id: businessId,
    actor_type: 'user',
    actor_id: owner.context.id,
    action: 'van_damage.inspection_metadata_retrieved',
    entity_type: 'van_damage_inspection',
    entity_id: inspectionId,
    metadata: { endpoint: 'inspection_metadata' } as Json,
  })

  return NextResponse.json({
    source: {
      type: inspection.source,
      workspaceId: inspection.slack_team_id,
      channelId: inspection.slack_channel_id,
      messageTimestamp: inspection.slack_message_ts,
    },
    processing: {
      inspectionStatus: inspection.status,
      jobStatus: job?.status ?? null,
      analysisStatus: run?.status ?? null,
      retryCount: job?.attempt_count ?? 0,
      startedAt: text(job?.started_at) ?? text(run?.created_at),
      completedAt: text(run?.completed_at) ?? text(job?.completed_at),
    },
    storage: {
      imageCount: inspection.image_count,
      provider: 'Private object storage',
    },
    database: {
      inspectionId: inspection.id,
      vehicleId: inspection.van_id,
      createdAt: inspection.created_at,
      updatedAt: inspection.updated_at,
      completedAt: inspection.completed_at,
    },
  })
}
