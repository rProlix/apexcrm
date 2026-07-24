'use server'

import { revalidatePath } from 'next/cache'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { loadTenantConfig } from '@/lib/tenant/loadTenantConfig'
import {
  filterDashboardLayoutForActiveWidgets,
  getActiveDashboardModulesForTenantUser,
} from '@/lib/dashboard/activeModules'
import type { DashboardLayout } from '@/lib/dashboard/types'

export async function saveLayout(tenantId: string, layout: DashboardLayout): Promise<void> {
  const userCtx = await getUserContext()
  if (!userCtx) throw new Error('Authentication required')
  if (userCtx.role !== 'owner' && userCtx.tenant_id !== tenantId) {
    throw new Error('Tenant access denied')
  }

  const tenantConfig = await loadTenantConfig(tenantId)
  if (!tenantConfig) throw new Error('Tenant not found')

  const activeDashboard = getActiveDashboardModulesForTenantUser({
    tenantConfig,
    userRole: userCtx.role,
  })
  const safeLayout = filterDashboardLayoutForActiveWidgets(
    layout,
    activeDashboard.widgets.map((widget) => widget.key)
  )

  const supabase = getSupabaseServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('dashboard_layouts')
    .upsert(
      { tenant_id: tenantId, layout: safeLayout },
      { onConflict: 'tenant_id' }
    )

  revalidatePath('/dashboard')
}
