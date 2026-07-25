import { hasPermission } from '@/lib/auth/permissions'
import type { AnyRole } from '@/lib/auth/types'
import type { NavModule } from '@/modules/shared/moduleTypes'

export type CommandRecordType =
  | 'vehicle'
  | 'inspection'
  | 'maintenance'
  | 'customer'
  | 'appointment'
  | 'order'
  | 'action'

export interface CommandResult {
  id: string
  kind: 'navigation' | 'record' | 'action'
  label: string
  description: string
  moduleKey: string
  href: string
  recordType?: CommandRecordType
  recordId?: string
  keywords?: string[]
}

export interface QuickPeekField {
  label: string
  value: string
  tone?: 'default' | 'strong' | 'warning' | 'danger' | 'success'
}

export interface QuickPeekPayload {
  type: CommandRecordType
  id: string
  moduleKey: string
  title: string
  subtitle: string
  status?: string
  summary?: string
  href: string
  fields: QuickPeekField[]
  actions: Array<{ label: string; href: string; primary?: boolean }>
  updatedAt?: string
}

export interface CommandNavigationInput {
  modules: NavModule[]
  role: AnyRole
  isPlatformAdmin: boolean
  commandCenter: {
    inbox: boolean
    activity: boolean
    reports: boolean
    setup: boolean
    notifications: boolean
  }
}

const RECORD_MODULE: Record<CommandRecordType, string> = {
  vehicle: 'vehicles',
  inspection: 'damage_ai',
  maintenance: 'maintenance',
  customer: 'customers',
  appointment: 'appointments',
  order: 'store',
  action: 'core',
}

export function normalizeCommandQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 80)
}

export function isRecordTypeAvailable(
  type: CommandRecordType,
  activeModuleKeys: Iterable<string>,
  role: AnyRole
): boolean {
  if (type === 'action') return hasPermission(role, 'view_dashboard')
  if (type === 'customer' && !hasPermission(role, 'view_customers')) return false
  const active = new Set(activeModuleKeys)
  return active.has(RECORD_MODULE[type])
}

export function getCommandNavigation({
  modules,
  role,
  isPlatformAdmin,
  commandCenter,
}: CommandNavigationInput): CommandResult[] {
  const results: CommandResult[] = [
    navigation('dashboard', 'Dashboard', 'Open the operational overview', 'core', '/dashboard', [
      'home',
      'overview',
    ]),
  ]

  for (const navModule of modules) {
    results.push(
      navigation(
        `module:${navModule.key}`,
        navModule.label,
        `Open ${navModule.label}`,
        navModule.key,
        navModule.href,
        ['module']
      )
    )
  }

  if (commandCenter.inbox) {
    results.push(
      navigation(
        'actions',
        'Action Required',
        'Review work that needs a human decision',
        'core',
        '/actions',
        ['inbox', 'review', 'urgent']
      )
    )
  }
  if (commandCenter.activity) {
    results.push(
      navigation(
        'activity',
        'Staff activity',
        'Review recent operational changes',
        'core',
        '/activity',
        ['history', 'audit']
      )
    )
  }
  if (commandCenter.reports) {
    results.push(
      navigation('reports', 'Reports', 'Build an authorized operational report', 'core', '/reports')
    )
  }
  if (commandCenter.setup) {
    results.push(
      navigation('setup', 'Smart setup', 'Continue workspace configuration', 'core', '/setup')
    )
  }
  if (commandCenter.notifications) {
    results.push(
      navigation(
        'notifications',
        'Notifications',
        'Open workspace notifications',
        'core',
        '/notifications'
      )
    )
  }

  if (role === 'owner' || role === 'admin') {
    results.push(
      navigation('settings', 'Workspace settings', 'Manage tenant settings', 'core', '/settings')
    )
  }

  if (modules.some((module) => module.key === 'appointments')) {
    results.push({
      ...navigation(
        'action:new-appointment',
        'New appointment',
        'Open the appointment scheduler',
        'appointments',
        '/appointments?command=new'
      ),
      kind: 'action',
    })
  }

  if (
    modules.some((module) => module.key === 'customers') &&
    (role === 'owner' || role === 'admin')
  ) {
    results.push({
      ...navigation(
        'action:invite-customer',
        'Invite customer',
        'Open a secure customer invitation',
        'customers',
        '/customers?command=invite'
      ),
      kind: 'action',
    })
  }

  if (isPlatformAdmin) {
    results.push(
      navigation(
        'owner:tenants',
        'Businesses',
        'Manage business workspaces',
        'platform',
        '/owner/tenants'
      ),
      navigation(
        'owner:packages',
        'Module packages',
        'Build and apply module packages',
        'platform',
        '/owner/packages'
      )
    )
  }

  return dedupeById(results)
}

export function filterCommandResults(results: CommandResult[], query: string): CommandResult[] {
  const needle = normalizeCommandQuery(query).toLocaleLowerCase()
  if (!needle) return results
  return results.filter((result) =>
    [result.label, result.description, result.moduleKey, ...(result.keywords ?? [])]
      .join(' ')
      .toLocaleLowerCase()
      .includes(needle)
  )
}

function navigation(
  id: string,
  label: string,
  description: string,
  moduleKey: string,
  href: string,
  keywords?: string[]
): CommandResult {
  return { id, kind: 'navigation', label, description, moduleKey, href, keywords }
}

function dedupeById(results: CommandResult[]): CommandResult[] {
  return [...new Map(results.map((result) => [result.id, result])).values()]
}
