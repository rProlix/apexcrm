// lib/staff/canManageStaff.ts
// Permission helper: can a given caller manage (update/delete) a given target?
//
// Rules enforced here:
//  1. Owner accounts can NEVER be managed by anyone except the platform itself.
//  2. A user can never manage themselves via this flow.
//  3. Cross-tenant management is always denied.
//  4. The platform owner can manage any non-owner in their tenant.
//  5. An admin can manage non-owner users in their own tenant.
//     - For DELETE: the admin can only remove staff they personally invited
//       (metadata.invited_by === admin.id), OR any staff if no invited_by is set.

interface Caller {
  id:        string
  role:      string
  tenant_id: string | null
}

interface Target {
  id:        string
  role:      string
  tenant_id: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, unknown> | null | any
}

export interface ManageStaffResult {
  allowed: boolean
  reason?:  string
}

/**
 * Returns true if `caller` is permitted to perform a management action on `target`.
 *
 * This function is pure — it does not perform any database queries.
 * The caller is responsible for fetching up-to-date records before calling this.
 */
export function canManageStaff(caller: Caller, target: Target): boolean {
  return resolveCanManage(caller, target).allowed
}

/**
 * Verbose version that also returns the denial reason for logging / error messages.
 */
export function resolveCanManage(caller: Caller, target: Target): ManageStaffResult {
  // ── Hard blocks ────────────────────────────────────────────────────────────

  if (target.role === 'owner') {
    return { allowed: false, reason: 'Owner accounts cannot be managed' }
  }

  if (caller.id === target.id) {
    return { allowed: false, reason: 'Cannot manage your own account' }
  }

  // Tenant isolation: both parties must share a tenant_id
  if (!caller.tenant_id || !target.tenant_id) {
    return { allowed: false, reason: 'Missing tenant context' }
  }

  if (caller.tenant_id !== target.tenant_id) {
    return { allowed: false, reason: 'Cross-tenant access denied' }
  }

  // ── Role-based gates ───────────────────────────────────────────────────────

  if (caller.role === 'owner') {
    // Platform owner can manage any non-owner in their tenant
    return { allowed: true }
  }

  if (caller.role === 'admin') {
    // Admin can always update roles for anyone in their tenant
    // For deletions, the API layer additionally checks invited_by.
    // We allow the action here; fine-grained invite ownership is enforced
    // in the API routes where the context (delete vs. update) is known.
    return { allowed: true }
  }

  // Staff members have no management rights
  return { allowed: false, reason: 'Insufficient role' }
}

/**
 * Specific guard for delete operations.
 * Admin may only delete staff they personally invited (invited_by in metadata).
 * If no invited_by is recorded (legacy records), the admin may delete them.
 * Owner may delete any non-owner in their tenant.
 */
export function canDeleteStaff(caller: Caller, target: Target): ManageStaffResult {
  const base = resolveCanManage(caller, target)
  if (!base.allowed) return base

  // Owner: no additional restriction
  if (caller.role === 'owner') return { allowed: true }

  // Admin: check invited_by if present
  if (caller.role === 'admin') {
    const invitedBy = target.metadata?.invited_by

    // If there is an invited_by record and it doesn't match this admin → deny
    if (invitedBy && invitedBy !== caller.id) {
      return {
        allowed: false,
        reason: 'You can only remove staff members you personally invited',
      }
    }

    return { allowed: true }
  }

  return { allowed: false, reason: 'Insufficient role' }
}
