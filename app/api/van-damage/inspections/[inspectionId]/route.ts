import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { z } from 'zod'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { getVanDamageAwsEnv } from '@/lib/server/env'
import { normalizeTransitRegion } from '@/lib/van-damage/transit-blueprint'
import type { Json } from '@/lib/supabase/types'

export const runtime = 'nodejs'

const actionSchema = z.object({
  type: z.literal('action'),
  action: z.enum(['approve', 'reject', 'manual_review', 'mark_repaired', 'archive', 'restore']),
})

const commentSchema = z.object({
  type: z.literal('comment'),
  body: z.string().trim().min(1).max(4_000),
  parentId: z.string().uuid().nullable().optional(),
})

const regionCorrectionSchema = z.object({
  type: z.literal('region_correction'),
  itemId: z.string().uuid(),
  canonicalRegion: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(500),
})

const requestSchema = z.discriminatedUnion('type', [
  actionSchema,
  commentSchema,
  regionCorrectionSchema,
])

type MetadataRecord = Record<string, unknown>
type LooseQuery = {
  select: (columns: string) => LooseQuery
  update: (values: Record<string, unknown>) => LooseQuery
  eq: (column: string, value: unknown) => LooseQuery
  limit: (count: number) => Promise<{
    data: Record<string, unknown>[] | null
    error: { message: string } | null
  }>
  maybeSingle: () => Promise<{
    data: Record<string, unknown> | null
    error: { message: string } | null
  }>
  then: PromiseLike<{ error: { message: string } | null }>['then']
}

function asRecord(value: unknown): MetadataRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as MetadataRecord)
    : {}
}

function asRecordArray(value: unknown): MetadataRecord[] {
  return Array.isArray(value)
    ? (value.filter((item) => item && typeof item === 'object') as MetadataRecord[])
    : []
}

const attachmentTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
])

function safeFileName(value: string) {
  return (
    value
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'attachment'
  )
}

async function loadInspection(request: NextRequest, inspectionId: string, manage = false) {
  const access = await resolveVanDamageAccess(request.nextUrl.searchParams.get('businessId'), {
    manage,
  })
  if (!access.ok)
    return {
      response: NextResponse.json({ error: access.error }, { status: access.status }),
    } as const
  const db = getVanDamageServiceClient()
  const [{ data: inspection, error: loadError }, { data: actor }] = await Promise.all([
    db
      .from('van_damage_inspections')
      .select('id, status, review_status, metadata')
      .eq('id', inspectionId)
      .eq('tenant_id', access.tenantId)
      .eq('business_id', access.businessId)
      .maybeSingle(),
    db.from('users').select('email').eq('id', access.userId).maybeSingle(),
  ])
  if (loadError)
    return { response: NextResponse.json({ error: loadError.message }, { status: 500 }) } as const
  if (!inspection)
    return {
      response: NextResponse.json({ error: 'Inspection not found' }, { status: 404 }),
    } as const
  return { access, db, inspection, actorName: actor?.email || 'Team member' } as const
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ inspectionId: string }> }
) {
  const { inspectionId } = await params
  const loaded = await loadInspection(request, inspectionId)
  if ('response' in loaded) return loaded.response

  const form = await request.formData().catch(() => null)
  const body = form?.get('body')
  const parentId = form?.get('parentId')
  const bodyResult = z.string().trim().min(1).max(4_000).safeParse(body)
  if (!form || !bodyResult.success)
    return NextResponse.json({ error: 'A note is required' }, { status: 400 })
  const files = form
    .getAll('attachments')
    .filter((value): value is File => value instanceof File && value.size > 0)
  if (files.length > 5)
    return NextResponse.json({ error: 'Attach up to 5 files per note' }, { status: 400 })
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024)
      return NextResponse.json({ error: `${file.name} exceeds the 10 MB limit` }, { status: 400 })
    if (!attachmentTypes.has(file.type))
      return NextResponse.json(
        { error: `${file.name} is not a supported attachment type` },
        { status: 400 }
      )
  }

  const { access, db, inspection, actorName } = loaded
  const uploaded: MetadataRecord[] = []
  if (files.length) {
    const { region, bucket } = getVanDamageAwsEnv()
    const s3 = new S3Client({ region, maxAttempts: 2 })
    for (const file of files) {
      const id = crypto.randomUUID()
      const key = `tenants/${access.tenantId}/van-damage/${access.businessId}/inspections/${inspectionId}/comments/${id}-${safeFileName(file.name)}`
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: Buffer.from(await file.arrayBuffer()),
          ContentType: file.type,
          ServerSideEncryption: 'AES256',
          Metadata: { inspectionId, uploadedBy: access.userId },
        })
      )
      uploaded.push({ id, name: file.name, contentType: file.type, size: file.size, bucket, key })
    }
  }

  const now = new Date().toISOString()
  const metadata = asRecord(inspection.metadata)
  const phase3c = asRecord(metadata.phase3c)
  const auditTrail = asRecordArray(phase3c.auditTrail)
  const comments = asRecordArray(phase3c.comments)
  const comment = {
    id: crypto.randomUUID(),
    body: bodyResult.data,
    parentId: typeof parentId === 'string' && parentId ? parentId : null,
    kind: 'internal',
    authorId: access.userId,
    authorName: actorName,
    createdAt: now,
    attachments: uploaded,
  }
  const nextMetadata = {
    ...metadata,
    phase3c: {
      ...phase3c,
      comments: [...comments, comment].slice(-250),
      auditTrail: [
        ...auditTrail,
        {
          id: crypto.randomUUID(),
          type: 'comment_added',
          label: comment.parentId ? 'Reply added' : 'Internal note added',
          actorId: access.userId,
          actorName,
          createdAt: now,
        },
      ].slice(-250),
    },
  }
  const { error } = await db
    .from('van_damage_inspections')
    .update({ metadata: nextMetadata as unknown as Json })
    .eq('id', inspectionId)
    .eq('tenant_id', access.tenantId)
    .eq('business_id', access.businessId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    ok: true,
    comment: {
      ...comment,
      attachments: uploaded.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        contentType: attachment.contentType,
        size: attachment.size,
      })),
    },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ inspectionId: string }> }
) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid inspection update' }, { status: 400 })
  }

  const { inspectionId } = await params
  const loaded = await loadInspection(request, inspectionId, parsed.data.type === 'action')
  if ('response' in loaded) return loaded.response
  const { access, db, inspection, actorName } = loaded

  const now = new Date().toISOString()
  const metadata = asRecord(inspection.metadata)
  const phase3c = asRecord(metadata.phase3c)
  const auditTrail = asRecordArray(phase3c.auditTrail)
  const comments = asRecordArray(phase3c.comments)
  const looseDb = db as unknown as { from: (table: string) => LooseQuery }

  const loadHasLevel3 = async () => {
    const { data } = await looseDb
      .from('van_damage_items')
      .select('severity')
      .eq('inspection_id', inspectionId)
      .eq('tenant_id', access.tenantId)
      .eq('business_id', access.businessId)
      .limit(500)
    return (data ?? []).some((item) =>
      ['high', 'critical', 'level_3'].includes(String(item.severity ?? ''))
    )
  }

  if (parsed.data.type === 'comment') {
    const comment = {
      id: crypto.randomUUID(),
      body: parsed.data.body,
      parentId: parsed.data.parentId ?? null,
      kind: 'internal',
      authorId: access.userId,
      authorName: actorName,
      createdAt: now,
    }
    const nextMetadata = {
      ...metadata,
      phase3c: {
        ...phase3c,
        comments: [...comments, comment].slice(-250),
        auditTrail: [
          ...auditTrail,
          {
            id: crypto.randomUUID(),
            type: 'comment_added',
            label: parsed.data.parentId ? 'Reply added' : 'Internal note added',
            actorId: access.userId,
            actorName,
            createdAt: now,
          },
        ].slice(-250),
      },
    }
    const { error } = await db
      .from('van_damage_inspections')
      .update({ metadata: nextMetadata as unknown as Json })
      .eq('id', inspectionId)
      .eq('tenant_id', access.tenantId)
      .eq('business_id', access.businessId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, comment })
  }

  if (parsed.data.type === 'region_correction') {
    const canonicalRegion = normalizeTransitRegion(parsed.data.canonicalRegion)
    if (!canonicalRegion) {
      return NextResponse.json({ error: 'Select a valid vehicle section.' }, { status: 400 })
    }
    const { data: item, error: itemError } = await looseDb
      .from('van_damage_items')
      .select('id, damage_case_id, canonical_region, vehicle_area, metadata')
      .eq('id', parsed.data.itemId)
      .eq('inspection_id', inspectionId)
      .eq('tenant_id', access.tenantId)
      .eq('business_id', access.businessId)
      .maybeSingle()
    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })
    if (!item) return NextResponse.json({ error: 'Damage finding not found.' }, { status: 404 })

    const previousRegion =
      typeof item.canonical_region === 'string' && item.canonical_region.trim()
        ? item.canonical_region
        : typeof item.vehicle_area === 'string'
          ? item.vehicle_area
          : null
    const correction = {
      id: crypto.randomUUID(),
      type: 'region_corrected',
      itemId: parsed.data.itemId,
      damageCaseId:
        typeof item.damage_case_id === 'string' && item.damage_case_id ? item.damage_case_id : null,
      previousRegion,
      canonicalRegion,
      reason: parsed.data.reason,
      actorId: access.userId,
      actorName,
      createdAt: now,
    }
    const itemMetadata = asRecord(item.metadata)
    const { error: updateItemError } = await looseDb
      .from('van_damage_items')
      .update({
        canonical_region: canonicalRegion,
        metadata: {
          ...itemMetadata,
          humanReviewedCanonicalRegion: canonicalRegion,
          canonicalRegionReviewedAt: now,
          canonicalRegionReviewedBy: access.userId,
          canonicalRegionReviewReason: parsed.data.reason,
          previousCanonicalRegion: previousRegion,
        } as unknown as Json,
      })
      .eq('id', parsed.data.itemId)
      .eq('inspection_id', inspectionId)
      .eq('tenant_id', access.tenantId)
      .eq('business_id', access.businessId)
    if (updateItemError)
      return NextResponse.json({ error: updateItemError.message }, { status: 500 })

    if (correction.damageCaseId) {
      const { data: damageCase, error: caseLoadError } = await looseDb
        .from('van_damage_cases')
        .select('metadata')
        .eq('id', correction.damageCaseId)
        .eq('tenant_id', access.tenantId)
        .eq('business_id', access.businessId)
        .maybeSingle()
      if (caseLoadError) return NextResponse.json({ error: caseLoadError.message }, { status: 500 })
      const caseMetadata = asRecord(damageCase?.metadata)
      const { error: updateCaseError } = await looseDb
        .from('van_damage_cases')
        .update({
          canonical_region: canonicalRegion,
          needs_review: false,
          metadata: {
            ...caseMetadata,
            humanReviewedCanonicalRegion: canonicalRegion,
            canonicalRegionReviewedAt: now,
            canonicalRegionReviewedBy: access.userId,
            canonicalRegionReviewReason: parsed.data.reason,
            previousCanonicalRegion: previousRegion,
          } as unknown as Json,
          updated_at: now,
        })
        .eq('id', correction.damageCaseId)
        .eq('tenant_id', access.tenantId)
        .eq('business_id', access.businessId)
      if (updateCaseError)
        return NextResponse.json({ error: updateCaseError.message }, { status: 500 })
    }

    const nextMetadata = {
      ...metadata,
      phase3c: {
        ...phase3c,
        auditTrail: [
          ...auditTrail,
          {
            id: correction.id,
            type: correction.type,
            label: `Damage section corrected to ${canonicalRegion.replaceAll('_', ' ')}`,
            actorId: access.userId,
            actorName,
            createdAt: now,
            itemId: parsed.data.itemId,
            damageCaseId: correction.damageCaseId,
            previousRegion,
            canonicalRegion,
            reason: parsed.data.reason,
          },
        ].slice(-250),
      },
    }
    const hasLevel3 = await loadHasLevel3()
    const { error: inspectionError } = await db
      .from('van_damage_inspections')
      .update({
        review_status: hasLevel3
          ? inspection.review_status === 'reviewed'
            ? 'reviewed'
            : 'in_review'
          : inspection.review_status === 'reviewed'
            ? 'reviewed'
            : 'pending',
        status: hasLevel3 ? 'needs_review' : 'completed',
        reviewed_by: access.userId,
        reviewed_at: now,
        metadata: nextMetadata as unknown as Json,
      })
      .eq('id', inspectionId)
      .eq('tenant_id', access.tenantId)
      .eq('business_id', access.businessId)
    if (inspectionError)
      return NextResponse.json({ error: inspectionError.message }, { status: 500 })

    await db.from('activity_logs').insert({
      tenant_id: access.tenantId,
      actor_type: 'user',
      actor_id: access.userId,
      action: 'van_damage.region_corrected',
      entity_type: 'van_damage_inspection',
      entity_id: inspectionId,
      metadata: correction as unknown as Json,
    })
    return NextResponse.json({ ok: true, canonicalRegion })
  }

  const hasLevel3 = await loadHasLevel3()
  if (parsed.data.action === 'manual_review' && !hasLevel3) {
    return NextResponse.json(
      { error: 'Only Level 3 damage requires the review workflow.' },
      { status: 409 }
    )
  }

  const actionConfig = {
    approve: {
      label: 'Inspection approved',
      reviewStatus: 'reviewed',
      status: inspection.status === 'failed' ? 'failed' : 'completed',
      lifecycle: 'approved',
    },
    reject: {
      label: 'Inspection rejected',
      reviewStatus: 'dismissed',
      status: inspection.status === 'failed' ? 'failed' : 'completed',
      lifecycle: 'rejected',
    },
    manual_review: {
      label: 'Manual review requested',
      reviewStatus: 'in_review',
      status: 'needs_review',
      lifecycle: 'manual_review',
    },
    mark_repaired: {
      label: 'Damage marked repaired',
      reviewStatus: 'reviewed',
      status: inspection.status === 'failed' ? 'failed' : 'completed',
      lifecycle: 'repaired',
    },
    archive: {
      label: 'Inspection archived',
      reviewStatus: inspection.review_status,
      status: inspection.status,
      lifecycle: 'archived',
    },
    restore: {
      label: 'Inspection restored',
      reviewStatus: hasLevel3
        ? inspection.review_status === 'dismissed'
          ? 'in_review'
          : inspection.review_status
        : 'pending',
      status: hasLevel3 ? 'needs_review' : 'completed',
      lifecycle: hasLevel3
        ? inspection.review_status === 'reviewed'
          ? 'approved'
          : 'manual_review'
        : 'approved',
    },
  } as const
  const config = actionConfig[parsed.data.action]
  const nextMetadata = {
    ...metadata,
    phase3c: {
      ...phase3c,
      lifecycle: config.lifecycle,
      archivedAt: parsed.data.action === 'archive' ? now : phase3c.archivedAt,
      restoredAt: parsed.data.action === 'restore' ? now : phase3c.restoredAt,
      repairedAt: parsed.data.action === 'mark_repaired' ? now : phase3c.repairedAt,
      auditTrail: [
        ...auditTrail,
        {
          id: crypto.randomUUID(),
          type: parsed.data.action,
          label: config.label,
          actorId: access.userId,
          actorName,
          createdAt: now,
        },
      ].slice(-250),
    },
  }
  const { error } = await db
    .from('van_damage_inspections')
    .update({
      status: config.status,
      review_status: config.reviewStatus,
      reviewed_by: access.userId,
      reviewed_at: now,
      metadata: nextMetadata as unknown as Json,
    })
    .eq('id', inspectionId)
    .eq('tenant_id', access.tenantId)
    .eq('business_id', access.businessId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { error: caseError } = await db.rpc('apply_van_damage_inspection_action', {
    p_inspection_id: inspectionId,
    p_tenant_id: access.tenantId,
    p_business_id: access.businessId,
    p_action: parsed.data.action,
    p_actor_id: access.userId,
  })
  if (caseError) return NextResponse.json({ error: caseError.message }, { status: 500 })
  await db.from('activity_logs').insert({
    tenant_id: access.tenantId,
    actor_type: 'user',
    actor_id: access.userId,
    action: `van_damage.inspection_${parsed.data.action}`,
    entity_type: 'van_damage_inspection',
    entity_id: inspectionId,
    metadata: { review_status: config.reviewStatus } as Json,
  })
  return NextResponse.json({ ok: true, action: parsed.data.action })
}
