import { redirect } from 'next/navigation'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'

export async function getVanDamagePageScope(requestedBusinessId?: string, manage = false) {
  const ctx = await getUserContext()
  if (!ctx) redirect('/login')
  if (manage && !['owner', 'admin'].includes(ctx.role)) redirect('/dashboard/damage-ai?error=forbidden')
  if (ctx.role !== 'owner' && requestedBusinessId && requestedBusinessId !== ctx.tenant_id) {
    redirect('/dashboard/damage-ai?error=business_scope')
  }
  const businessId = ctx.role === 'owner' ? requestedBusinessId : ctx.tenant_id ?? undefined
  if (!businessId) return { ctx, businessId: null, tenantId: null }
  const { data: tenant } = await getSupabaseServerClient().from('tenants').select('id').eq('id', businessId).maybeSingle()
  if (!tenant) return { ctx, businessId: null, tenantId: null }
  await guardModuleAccess(businessId, 'damage_ai', ctx.role)
  return { ctx, businessId, tenantId: businessId }
}
