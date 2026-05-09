// lib/staff/getTenantStaff.ts
// Server-side helper to fetch staff for a tenant.
// Owner accounts are ALWAYS excluded — this is a hard invariant of this module.
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface StaffMember {
  id:         string
  email:      string
  full_name:  string | null
  role:       'admin' | 'manager' | 'staff'
  status:     string
  approved:   boolean
  created_at: string
  metadata:   Record<string, unknown>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STAFF_ROLES = ['admin', 'manager', 'staff'] as any

/**
 * Returns all non-owner users for a given tenant, ordered by join date.
 * Safe to call from server components, API routes, and server actions.
 *
 * INVARIANT: owner rows are NEVER returned regardless of the DB state.
 */
export async function getTenantStaff(tenantId: string): Promise<StaffMember[]> {
  if (!tenantId) return []

  const db = getSupabaseServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('users')
    .select('id, email, full_name, role, status, approved, created_at, metadata')
    .eq('tenant_id', tenantId)
    .neq('role', 'owner')               // primary owner filter
    .in('role', STAFF_ROLES)            // secondary: only recognised staff roles
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[getTenantStaff] DB error:', error.message)
    return []
  }

  // Belt-and-suspenders: filter in JS as well so that any future role changes
  // in the DB never accidentally surface owner records to tenant UI.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? [])
    .filter((u: any) => u.role !== 'owner')
    .map((u: any) => ({
      id:         u.id,
      email:      u.email,
      full_name:  u.full_name ?? null,
      role:       u.role as StaffMember['role'],
      status:     u.status,
      approved:   u.approved !== false,
      created_at: u.created_at,
      metadata:   (u.metadata ?? {}) as Record<string, unknown>,
    }))
}

/**
 * Returns a single staff member by ID, or null if the member does not exist,
 * does not belong to the tenant, or is an owner account.
 */
export async function getStaffMember(
  tenantId: string,
  userId:   string,
): Promise<StaffMember | null> {
  if (!tenantId || !userId) return null

  const db = getSupabaseServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('users')
    .select('id, email, full_name, role, status, approved, created_at, metadata')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .neq('role', 'owner')
    .maybeSingle()

  if (!data || data.role === 'owner') return null
  return {
    id:         data.id,
    email:      data.email,
    full_name:  data.full_name ?? null,
    role:       data.role as StaffMember['role'],
    status:     data.status,
    approved:   data.approved !== false,
    created_at: data.created_at,
    metadata:   (data.metadata ?? {}) as Record<string, unknown>,
  }
}

/**
 * Counts active staff (non-owner) for a tenant.
 * Useful for plan limit checks.
 */
export async function countTenantStaff(tenantId: string): Promise<number> {
  if (!tenantId) return 0

  const db = getSupabaseServerClient()

  const { count, error } = await db
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .neq('role', 'owner')
    .in('role', STAFF_ROLES)

  if (error) return 0
  return count ?? 0
}
