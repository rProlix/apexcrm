'use server'

import { revalidatePath } from 'next/cache'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'
import { setModuleEnabled } from '@/lib/modules/setModuleEnabled'

export async function toggleModule(
  tenantId:  string,
  moduleKey: string,
  enabled:   boolean,
): Promise<{ success: boolean; error?: string }> {
  // Verify the caller is authenticated and is an admin/owner of this tenant
  const sessionClient = await createSessionServerClient()
  const { data: { user } } = await sessionClient.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const admin = getSupabaseServerClient()
  const { data: userRecord } = await admin
    .from('users')
    .select('role, tenant_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!userRecord) {
    return { success: false, error: 'User not found' }
  }

  // Only admin and platform owner can toggle modules
  if (userRecord.role !== 'admin' && userRecord.role !== 'owner') {
    return { success: false, error: 'Insufficient permissions' }
  }

  // Admin can only toggle modules for their own tenant
  if (userRecord.role === 'admin' && userRecord.tenant_id !== tenantId) {
    return { success: false, error: 'Access denied' }
  }

  const result = await setModuleEnabled(tenantId, moduleKey, enabled)

  if (result.success) {
    revalidatePath('/modules')
    revalidatePath('/dashboard')
  }

  return result
}
