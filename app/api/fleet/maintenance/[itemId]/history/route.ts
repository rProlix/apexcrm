import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveMaintenanceItemAccess } from '@/lib/server/maintenance/access'

const schema = z.object({
  businessId: z.string().uuid().optional(),
  note: z.string().trim().min(1).max(4_000),
})

export async function POST(request: NextRequest, context: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await context.params
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'A note is required' }, { status: 400 })
  const loaded = await resolveMaintenanceItemAccess(itemId, parsed.data.businessId)
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  const now = new Date().toISOString()
  const { data, error } = await loaded.db
    .from('fleet_maintenance_history')
    .insert({
      tenant_id: loaded.access.tenantId,
      business_id: loaded.access.businessId,
      van_id: loaded.item.van_id,
      maintenance_item_id: itemId,
      event_type: 'note_added',
      note: parsed.data.note,
      actor_type: 'crm_user',
      actor_user_id: loaded.access.userId,
      occurred_at: now,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await loaded.db
    .from('fleet_maintenance_items')
    .update({
      latest_note: parsed.data.note,
      latest_activity_at: now,
    })
    .eq('id', itemId)
    .eq('tenant_id', loaded.access.tenantId)
  return NextResponse.json({ history: data }, { status: 201 })
}
