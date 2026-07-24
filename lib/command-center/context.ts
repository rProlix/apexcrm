import 'server-only'

import { getUserContext } from '@/lib/auth/getUserContext'
import { hasPermission } from '@/lib/auth/permissions'
import type { AnyRole, UserContext } from '@/lib/auth/types'
import { getActiveDashboardModulesForTenantUser } from '@/lib/dashboard/activeModules'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadTenantConfig, type TenantConfig } from '@/lib/tenant/loadTenantConfig'
import { resolveInspectionTimeZone } from '@/lib/van-damage/inspection-period'

export class CommandCenterAccessError extends Error {
  constructor(
    message: string,
    public readonly status = 403
  ) {
    super(message)
    this.name = 'CommandCenterAccessError'
  }
}

export interface CommandCenterContext {
  user: UserContext
  tenantId: string
  role: AnyRole
  tenantConfig: TenantConfig
  activeModuleKeys: string[]
  activeModuleSet: Set<string>
  timeZone: string
  businessType: string
  db: ReturnType<typeof getSupabaseServerClient>
}

export async function requireCommandCenterContext(
  permission = 'view_dashboard'
): Promise<CommandCenterContext> {
  const user = await getUserContext()
  if (!user) throw new CommandCenterAccessError('Authentication required.', 401)
  if (!user.tenant_id) {
    throw new CommandCenterAccessError('Choose a tenant workspace to use the command center.')
  }
  if (!hasPermission(user.role, permission)) {
    await recordRejectedAccess(user, permission)
    throw new CommandCenterAccessError('You do not have permission to access this feature.')
  }

  const tenantConfig = await loadTenantConfig(user.tenant_id)
  if (!tenantConfig) {
    throw new CommandCenterAccessError('Workspace configuration could not be loaded.', 404)
  }

  const resolved = getActiveDashboardModulesForTenantUser({
    tenantConfig,
    userRole: user.role,
  })
  const activeModuleKeys = resolved.accessibleModuleKeys
  const branding = tenantConfig.branding as Record<string, unknown>
  const businessType =
    (typeof branding.industry === 'string' && branding.industry.trim()) || 'general'

  return {
    user,
    tenantId: user.tenant_id,
    role: user.role,
    tenantConfig,
    activeModuleKeys,
    activeModuleSet: new Set(activeModuleKeys),
    timeZone: resolveInspectionTimeZone({
      tenant: tenantConfig.tenant as unknown as Record<string, unknown>,
    }),
    businessType,
    db: getSupabaseServerClient(),
  }
}

export function assertActiveModule(context: CommandCenterContext, moduleKey: string): void {
  if (!context.activeModuleSet.has(moduleKey)) {
    throw new CommandCenterAccessError('This module is not active for your workspace.', 404)
  }
}

export function isTenantAdmin(role: AnyRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager'
}

async function recordRejectedAccess(user: UserContext, permission: string): Promise<void> {
  if (!user.tenant_id) return
  const { error } = await getSupabaseServerClient().from('audit_logs').insert({
    tenant_id: user.tenant_id,
    actor_user_id: user.id,
    action: 'command_center.access.rejected',
    metadata: { permission },
  })
  if (error) {
    console.error('[command-center:access] rejection audit failed', { code: error.code })
  }
}
