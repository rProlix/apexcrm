import { NextRequest, NextResponse } from 'next/server'
import {
  MAINTENANCE_ATTACHMENT_TYPES,
  MAX_MAINTENANCE_ATTACHMENT_BYTES,
  uploadMaintenanceAttachment,
} from '@/lib/server/maintenance/attachments'
import { resolveMaintenanceItemAccess } from '@/lib/server/maintenance/access'

export async function POST(request: NextRequest, context: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await context.params
  const form = await request.formData().catch(() => null)
  const businessId = form?.get('businessId')
  const loaded = await resolveMaintenanceItemAccess(
    itemId,
    typeof businessId === 'string' ? businessId : null
  )
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  const files = (form?.getAll('attachments') ?? []).filter(
    (value): value is File => value instanceof File && value.size > 0
  )
  if (!files.length || files.length > 5)
    return NextResponse.json({ error: 'Attach between 1 and 5 files' }, { status: 400 })
  for (const file of files) {
    if (!MAINTENANCE_ATTACHMENT_TYPES.has(file.type))
      return NextResponse.json({ error: `${file.name} is not supported` }, { status: 400 })
    if (file.size > MAX_MAINTENANCE_ATTACHMENT_BYTES)
      return NextResponse.json({ error: `${file.name} exceeds 25 MB` }, { status: 400 })
  }

  const uploaded = []
  for (const file of files) {
    const { data: attachment, error } = await loaded.db
      .from('fleet_maintenance_attachments')
      .insert({
        tenant_id: loaded.access.tenantId,
        business_id: loaded.access.businessId,
        van_id: loaded.item.van_id,
        maintenance_item_id: itemId,
        source: 'manual',
        filename: file.name,
        content_type: file.type,
        file_size_bytes: file.size,
        status: 'pending',
        metadata: { uploadedBy: loaded.access.userId },
      })
      .select('*')
      .single()
    if (error || !attachment)
      return NextResponse.json(
        { error: error?.message ?? 'Unable to create attachment' },
        { status: 500 }
      )
    try {
      await uploadMaintenanceAttachment({
        attachmentId: attachment.id,
        tenantId: loaded.access.tenantId,
        businessId: loaded.access.businessId,
        itemId,
        filename: file.name,
        contentType: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      })
      uploaded.push({ ...attachment, status: 'uploaded' })
    } catch (error) {
      await loaded.db
        .from('fleet_maintenance_attachments')
        .update({
          status: 'failed',
          metadata: {
            error: error instanceof Error ? error.message.slice(0, 300) : 'Upload failed',
          },
        })
        .eq('id', attachment.id)
      return NextResponse.json({ error: 'Unable to store attachment' }, { status: 502 })
    }
  }
  const now = new Date().toISOString()
  await loaded.db.from('fleet_maintenance_history').insert({
    tenant_id: loaded.access.tenantId,
    business_id: loaded.access.businessId,
    van_id: loaded.item.van_id,
    maintenance_item_id: itemId,
    event_type: 'attachments_added',
    note: `${uploaded.length} attachment${uploaded.length === 1 ? '' : 's'} added`,
    actor_type: 'crm_user',
    actor_user_id: loaded.access.userId,
    occurred_at: now,
    metadata: { attachmentIds: uploaded.map((item) => item.id) },
  })
  return NextResponse.json({ attachments: uploaded }, { status: 201 })
}
