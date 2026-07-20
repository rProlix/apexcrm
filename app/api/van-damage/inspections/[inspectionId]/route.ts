import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { z } from 'zod'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { getVanDamageAwsEnv } from '@/lib/server/env'
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

const requestSchema = z.discriminatedUnion('type', [actionSchema, commentSchema])

type MetadataRecord = Record<string, unknown>

function asRecord(value: unknown): MetadataRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as MetadataRecord
    : {}
}

function asRecordArray(value: unknown): MetadataRecord[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') as MetadataRecord[] : []
}

const attachmentTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'])

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'attachment'
}

async function loadInspection(request: NextRequest, inspectionId: string, manage = false) {
  const access = await resolveVanDamageAccess(request.nextUrl.searchParams.get('businessId'), { manage })
  if (!access.ok) return { response: NextResponse.json({ error: access.error }, { status: access.status }) } as const
  const db = getVanDamageServiceClient()
  const [{ data: inspection, error: loadError }, { data: actor }] = await Promise.all([
    db.from('van_damage_inspections').select('id, status, review_status, metadata')
      .eq('id', inspectionId).eq('tenant_id', access.tenantId).eq('business_id', access.businessId).maybeSingle(),
    db.from('users').select('email').eq('id', access.userId).maybeSingle(),
  ])
  if (loadError) return { response: NextResponse.json({ error: loadError.message }, { status: 500 }) } as const
  if (!inspection) return { response: NextResponse.json({ error: 'Inspection not found' }, { status: 404 }) } as const
  return { access, db, inspection, actorName: actor?.email || 'Team member' } as const
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ inspectionId: string }> },
) {
  const { inspectionId } = await params
  const loaded = await loadInspection(request, inspectionId)
  if ('response' in loaded) return loaded.response

  const form = await request.formData().catch(() => null)
  const body = form?.get('body')
  const parentId = form?.get('parentId')
  const bodyResult = z.string().trim().min(1).max(4_000).safeParse(body)
  if (!form || !bodyResult.success) return NextResponse.json({ error: 'A note is required' }, { status: 400 })
  const files = form.getAll('attachments').filter((value): value is File => value instanceof File && value.size > 0)
  if (files.length > 5) return NextResponse.json({ error: 'Attach up to 5 files per note' }, { status: 400 })
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: `${file.name} exceeds the 10 MB limit` }, { status: 400 })
    if (!attachmentTypes.has(file.type)) return NextResponse.json({ error: `${file.name} is not a supported attachment type` }, { status: 400 })
  }

  const { access, db, inspection, actorName } = loaded
  const uploaded: MetadataRecord[] = []
  if (files.length) {
    const { region, bucket } = getVanDamageAwsEnv()
    const s3 = new S3Client({ region, maxAttempts: 2 })
    for (const file of files) {
      const id = crypto.randomUUID()
      const key = `tenants/${access.tenantId}/van-damage/${access.businessId}/inspections/${inspectionId}/comments/${id}-${safeFileName(file.name)}`
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type,
        ServerSideEncryption: 'AES256',
        Metadata: { inspectionId, uploadedBy: access.userId },
      }))
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
      auditTrail: [...auditTrail, {
        id: crypto.randomUUID(),
        type: 'comment_added',
        label: comment.parentId ? 'Reply added' : 'Internal note added',
        actorId: access.userId,
        actorName,
        createdAt: now,
      }].slice(-250),
    },
  }
  const { error } = await db.from('van_damage_inspections').update({ metadata: nextMetadata as unknown as Json })
    .eq('id', inspectionId).eq('tenant_id', access.tenantId).eq('business_id', access.businessId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, comment })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ inspectionId: string }> },
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
        auditTrail: [...auditTrail, {
          id: crypto.randomUUID(),
          type: 'comment_added',
          label: parsed.data.parentId ? 'Reply added' : 'Internal note added',
          actorId: access.userId,
          actorName,
          createdAt: now,
        }].slice(-250),
      },
    }
    const { error } = await db.from('van_damage_inspections').update({ metadata: nextMetadata as unknown as Json })
      .eq('id', inspectionId)
      .eq('tenant_id', access.tenantId)
      .eq('business_id', access.businessId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, comment })
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
      reviewStatus: inspection.review_status === 'dismissed' ? 'in_review' : inspection.review_status,
      status: inspection.status === 'needs_review' ? 'needs_review' : 'completed',
      lifecycle: inspection.review_status === 'reviewed' ? 'approved' : 'manual_review',
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
      auditTrail: [...auditTrail, {
        id: crypto.randomUUID(),
        type: parsed.data.action,
        label: config.label,
        actorId: access.userId,
        actorName,
        createdAt: now,
      }].slice(-250),
    },
  }
  const { error } = await db.from('van_damage_inspections').update({
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
  return NextResponse.json({ ok: true, action: parsed.data.action })
}
