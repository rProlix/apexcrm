// lib/auth/getUserContext.ts
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'
import type { UserContext } from './types'

/**
 * Returns the authenticated user's full RBAC context by:
 *  1. Validating the JWT with Supabase Auth (server-side, not cached)
 *  2. Enriching with the row from the public.users table
 *
 * Returns null if:
 *  - No active session
 *  - No matching active user record
 *
 * This is the canonical way to obtain a user's role in server components,
 * route handlers, and server actions. Never trust role values from the client.
 */
export async function getUserContext(): Promise<UserContext | null> {
  let user: User | null = null
  try {
    const sessionClient = await createSessionServerClient()
    const { data, error } = await sessionClient.auth.getUser()
    if (error || !data.user) return null
    user = data.user
  } catch {
    return null
  }

  if (!user) return null

  const admin = getSupabaseServerClient()
  const { data: record, error: dbError } = await admin
    .from('users')
    .select('id, tenant_id, role, email, status')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (dbError) {
    console.error('[getUserContext] DB error:', dbError.message)
    return null
  }

  if (!record) return null

  return {
    id:        record.id,
    auth_id:   user.id,
    tenant_id: record.tenant_id ?? null,
    role:      record.role as UserContext['role'],
    email:     record.email,
  }
}

/**
 * Returns true when the authenticated user is the platform owner.
 * Convenience wrapper around getUserContext().
 */
export async function isOwner(): Promise<boolean> {
  const ctx = await getUserContext()
  return ctx?.role === 'owner'
}
