import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'

export async function resolveMaintenanceItemAccess(
  itemId: string,
  businessId: string | null | undefined,
  options: { manage?: boolean } = {}
) {
  const access = await resolveVanDamageAccess(businessId, options)
  if (!access.ok) return { ok: false as const, status: access.status, error: access.error }
  const db = getVanDamageServiceClient()
  const { data: item, error } = await db
    .from('fleet_maintenance_items')
    .select('*')
    .eq('id', itemId)
    .eq('tenant_id', access.tenantId)
    .eq('business_id', access.businessId)
    .maybeSingle()
  if (error) return { ok: false as const, status: 500 as const, error: error.message }
  if (!item)
    return { ok: false as const, status: 404 as const, error: 'Maintenance item not found' }
  return { ok: true as const, access, db, item }
}

export async function vehicleBelongsToTenant(
  tenantId: string,
  vehicleId: string | null | undefined
) {
  if (!vehicleId) return true
  const { data } = await getVanDamageServiceClient()
    .from('vehicles')
    .select('id')
    .eq('id', vehicleId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return Boolean(data)
}
