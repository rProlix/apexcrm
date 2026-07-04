import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

type AccessResult =
  | { ok: true; tenantId: string; businessId: string; userId: string; role: 'owner' | 'admin' | 'manager' | 'staff' }
  | { ok: false; status: 400 | 401 | 403 | 404; error: string }

export async function resolveVanDamageAccess(
  requestedBusinessId: string | null | undefined,
  options: { manage?: boolean } = {},
): Promise<AccessResult> {
  const ctx = await getUserContext()
  if (!ctx) return { ok: false, status: 401, error: 'Unauthorized' }
  if (options.manage && !['owner', 'admin'].includes(ctx.role)) {
    return { ok: false, status: 403, error: 'Owner or admin access required' }
  }

  const businessId = ctx.role === 'owner' ? requestedBusinessId : ctx.tenant_id
  if (!businessId) return { ok: false, status: 400, error: 'businessId is required' }
  if (ctx.role !== 'owner' && requestedBusinessId && requestedBusinessId !== ctx.tenant_id) {
    return { ok: false, status: 403, error: 'Business scope mismatch' }
  }

  const db = getSupabaseServerClient()
  const { data } = await db.from('tenants').select('id').eq('id', businessId).maybeSingle()
  if (!data) return { ok: false, status: 404, error: 'Business not found' }

  return {
    ok: true,
    tenantId: businessId,
    businessId,
    userId: ctx.id,
    role: ctx.role,
  }
}
