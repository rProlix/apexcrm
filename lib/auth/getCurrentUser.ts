import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'

export interface CurrentUser {
  authUserId: string
  userId:     string
  tenantId:   string
  role:       string
  email:      string
}

/**
 * Returns the current authenticated user with their tenant context.
 * Validates the JWT server-side via Supabase Auth, then enriches with
 * data from the users table. Returns null if unauthenticated or if
 * no active profile exists.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const sessionClient = await createSessionServerClient()
  const { data: { user }, error } = await sessionClient.auth.getUser()

  if (error || !user) return null

  const admin = getSupabaseServerClient()
  const { data: userRecord } = await admin
    .from('users')
    .select('id, tenant_id, role, email, status')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!userRecord) return null

  return {
    authUserId: user.id,
    userId:     userRecord.id,
    tenantId:   userRecord.tenant_id ?? '',
    role:       userRecord.role,
    email:      userRecord.email,
  }
}
