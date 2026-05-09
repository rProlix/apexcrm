// lib/types/businessUsers.ts
// Shared TypeScript types for the owner-managed business user system.

export type BusinessRole = 'owner' | 'admin' | 'manager' | 'staff'

export type BusinessUserStatus = 'active' | 'invited' | 'pending' | 'suspended' | 'disabled'

export interface TenantMembership {
  id:           string
  tenant_id:    string
  auth_user_id: string | null
  email:        string
  full_name:    string | null
  role:         BusinessRole
  status:       BusinessUserStatus
  approved:     boolean
  approved_by:  string | null
  approved_at:  string | null
  created_at:   string
  updated_at:   string
  metadata:     Record<string, unknown>
}

export interface CreateBusinessUserInput {
  tenantId:           string
  email:              string
  fullName:           string
  role:               BusinessRole
  password:           string
  approved?:          boolean
  status?:            BusinessUserStatus
  forcePasswordReset?: boolean
}

export interface UpdateBusinessUserInput {
  role?:     BusinessRole
  status?:   BusinessUserStatus
  approved?: boolean
  fullName?: string
}

export const BUSINESS_ROLES: BusinessRole[] = ['admin', 'manager', 'staff']
export const OWNER_ONLY_ROLES: BusinessRole[] = ['owner']
export const ALL_BUSINESS_ROLES: BusinessRole[] = ['owner', 'admin', 'manager', 'staff']

export const ROLE_LABELS: Record<BusinessRole, string> = {
  owner:   'Owner',
  admin:   'Admin',
  manager: 'Manager',
  staff:   'Staff',
}

export const STATUS_LABELS: Record<BusinessUserStatus, string> = {
  active:    'Active',
  invited:   'Invited',
  pending:   'Pending',
  suspended: 'Suspended',
  disabled:  'Disabled',
}
