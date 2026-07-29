'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Settings,
  Layers,
  Users,
  LogOut,
  Shield,
  CreditCard,
  CalendarDays,
  Star,
  Car,
  ScanLine,
  UserPlus,
  MessageSquare,
  BookUser,
  Globe,
  ShoppingBag,
  UserCheck,
  Rotate3D,
  Clock,
  List,
  LayoutGrid,
  Wrench,
  ServerCog,
  Inbox,
  Activity,
  FileBarChart,
  ListChecks,
  Bell,
  Boxes,
  ClipboardCheck,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { LiveBadge } from '@/components/ui/LiveBadge'
import type { NavModule } from '@/modules/shared/moduleTypes'
import type { CommandCenterNavConfig } from '@/components/dashboard/DashboardShell'

const MODULE_ICONS: Record<string, LucideIcon> = {
  payments: CreditCard,
  appointments: CalendarDays,
  rewards: Star,
  vehicles: Car,
  damage_ai: ScanLine,
  leads: UserPlus,
  messages: MessageSquare,
  contacts: BookUser,
  website: Globe,
  store: ShoppingBag,
  customers: UserCheck,
  product_360: Rotate3D,
}

interface SidebarProps {
  tenantName: string
  tenantLogoUrl?: string | null
  modules: NavModule[]
  userRole?: string
  isPlatformAdmin?: boolean
  /** Controlled open state (mobile drawer) */
  isOpen?: boolean
  /** Called when user closes the drawer (mobile) */
  onClose?: () => void
  commandCenter?: CommandCenterNavConfig
  openActionCount?: number
}

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  exact?: boolean
  /** Minimum roles that can see this item. Omit to show to everyone. */
  roles?: string[]
  badge?: number
}

const baseCoreNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, exact: true },
  // Settings and Modules visible to admin + owner; staff sees only Dashboard
  { label: 'Settings', href: '/settings', icon: Settings, roles: ['owner', 'admin'] },
  { label: 'Modules', href: '/modules', icon: Layers, roles: ['owner', 'admin'] },
]

const adminOnlyNav: NavItem[] = [{ label: 'Staff', href: '/staff', icon: Users }]

const platformNav: NavItem[] = [
  { label: 'Businesses', href: '/owner/tenants', icon: Users },
  { label: 'Infrastructure Configuration', href: '/owner/infrastructure', icon: ServerCog },
  { label: 'Admin', href: '/admin', icon: Shield },
  { label: 'Module Access', href: '/owner/modules', icon: Layers },
  { label: 'Module Packages', href: '/owner/packages', icon: Boxes },
  { label: 'Plans', href: '/owner/plans', icon: CreditCard },
]

export function Sidebar({
  tenantName,
  tenantLogoUrl,
  modules,
  userRole,
  isPlatformAdmin,
  isOpen = false,
  onClose,
  commandCenter,
  openActionCount = 0,
}: SidebarProps) {
  const pathname = usePathname()
  const isOwner = isPlatformAdmin || userRole === 'owner'
  const isAdmin = isOwner || userRole === 'admin'
  const commandNav: NavItem[] = [
    ...(commandCenter?.inbox
      ? [
          {
            label: 'Action Required',
            href: '/actions',
            icon: Inbox,
            badge: openActionCount,
          },
        ]
      : []),
    ...(commandCenter?.activity ? [{ label: 'Activity', href: '/activity', icon: Activity }] : []),
    ...(commandCenter?.reports ? [{ label: 'Reports', href: '/reports', icon: FileBarChart }] : []),
    ...(commandCenter?.setup ? [{ label: 'Setup', href: '/setup', icon: ListChecks }] : []),
    ...(commandCenter?.notifications
      ? [{ label: 'Notifications', href: '/notifications', icon: Bell }]
      : []),
  ]
  const coreNav = [baseCoreNav[0], ...commandNav, ...baseCoreNav.slice(1)]

  function isActive(href: string, exact = false) {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  function canSee(item: NavItem): boolean {
    if (!item.roles) return true
    if (isOwner) return true
    return item.roles.includes(userRole ?? '')
  }

  function handleLinkClick() {
    onClose?.()
  }

  return (
    <aside
      className={cn(
        // Base — fixed rail, always above overlay
        'crm-sidebar fixed bottom-0 left-0 top-0 z-40 w-64',
        'flex flex-col border-r border-surface-border',
        'bg-graphite-900/97 backdrop-blur-xl',
        // CSS-only transition so Framer Motion cannot override translateX
        'ui-mobile-sidebar transition-transform duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop: always visible, ignore isOpen
        'md:translate-x-0'
      )}
    >
      {/* Logo / tenant name */}
      <div className="crm-sidebar-brand flex min-h-16 items-center gap-3 border-b border-white/[0.065] px-4">
        <div
          className={cn(
            'brand-accent-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
            tenantLogoUrl && 'bg-white'
          )}
          style={
            tenantLogoUrl
              ? {
                  backgroundColor: 'rgb(248 250 252 / 0.96)',
                  backgroundImage: `url("${tenantLogoUrl}")`,
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: 'contain',
                }
              : undefined
          }
          role={tenantLogoUrl ? 'img' : undefined}
          aria-label={tenantLogoUrl ? `${tenantName} logo` : undefined}
        >
          {!tenantLogoUrl && (
            <span className="text-xs font-bold">{tenantName.slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-[-0.01em] text-white">
            {tenantName}
          </p>
          <LiveBadge label="Workspace active" className="mt-0.5" />
        </div>
        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white md:hidden"
          aria-label="Close sidebar"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Primary navigation">
        {/* Core pages — filtered by role */}
        {coreNav.filter(canSee).map((item) => (
          <SidebarItem
            key={item.href}
            {...item}
            active={isActive(item.href, item.exact)}
            onNavigate={handleLinkClick}
          />
        ))}

        {/* Module links — staff + admin + owner */}
        {modules.length > 0 && (
          <>
            <div className="px-2 pb-1 pt-5">
              <span className="crm-nav-label">Modules</span>
            </div>
            {modules.map((mod) => (
              <div key={mod.key}>
                <SidebarItem
                  label={mod.label}
                  href={mod.href}
                  icon={MODULE_ICONS[mod.key] ?? Layers}
                  active={isActive(mod.href)}
                  onNavigate={handleLinkClick}
                />
                {/* Appointments sub-nav — visible when in /appointments */}
                {mod.key === 'appointments' && isActive('/appointments') && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-gold-500/20 pl-3">
                    {[
                      { label: 'Overview', href: '/appointments', icon: LayoutGrid, exact: true },
                      {
                        label: 'Calendar',
                        href: '/appointments/calendar',
                        icon: CalendarDays,
                        exact: false,
                      },
                      { label: 'List', href: '/appointments/list', icon: List, exact: false },
                      {
                        label: 'Availability',
                        href: '/appointments/availability',
                        icon: Clock,
                        exact: false,
                      },
                      {
                        label: 'Settings',
                        href: '/appointments/settings',
                        icon: Settings,
                        exact: false,
                      },
                    ].map(({ label, href, icon: Icon, exact }) => {
                      const subActive = exact ? pathname === href : pathname.startsWith(href)
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={handleLinkClick}
                          className={cn(
                            'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                            subActive
                              ? 'text-gold-400 bg-gold-500/10'
                              : 'text-white/35 hover:text-white/70 hover:bg-graphite-700/50'
                          )}
                        >
                          <Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                          {label}
                          {label === 'Availability' && !subActive && (
                            <span className="ml-auto h-1 w-1 rounded-full bg-gold-400/60" />
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}
                {mod.key === 'damage_ai' && isActive('/dashboard/damage-ai') && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-brand/20 pl-3">
                    {[
                      {
                        label: 'Inspections',
                        href: '/dashboard/damage-ai',
                        icon: ScanLine,
                        exact: true,
                      },
                      {
                        label: 'Inspection compliance',
                        href: '/dashboard/damage-ai/compliance',
                        icon: ClipboardCheck,
                        exact: false,
                      },
                    ].map(({ label, href, icon: Icon, exact }) => {
                      const subActive = exact ? pathname === href : pathname.startsWith(href)
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={handleLinkClick}
                          className={cn(
                            'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                            subActive
                              ? 'bg-brand/10 text-brand'
                              : 'text-white/35 hover:bg-graphite-700/50 hover:text-white/70'
                          )}
                        >
                          <Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                          {label}
                        </Link>
                      )
                    })}
                  </div>
                )}
                {mod.key === 'vehicles' && isActive(mod.href) && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-gold-500/20 pl-3">
                    {[
                      { label: 'Fleet overview', href: mod.href, icon: LayoutGrid, exact: true },
                      {
                        label: 'Maintenance',
                        href: `${mod.href}/maintenance`,
                        icon: Wrench,
                        exact: false,
                      },
                      {
                        label: 'Driver profiles',
                        href: `${mod.href}/drivers`,
                        icon: UserCheck,
                        exact: false,
                      },
                    ].map(({ label, href, icon: Icon, exact }) => {
                      const subActive = exact ? pathname === href : pathname.startsWith(href)
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={handleLinkClick}
                          className={cn(
                            'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                            subActive
                              ? 'bg-gold-500/10 text-gold-400'
                              : 'text-white/35 hover:bg-graphite-700/50 hover:text-white/70'
                          )}
                        >
                          <Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                          {label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* Admin section — admin only (staff management) */}
        {isAdmin && !isOwner && (
          <>
            <div className="px-2 pb-1 pt-5">
              <span className="crm-nav-label">Management</span>
            </div>
            {adminOnlyNav.map((item) => (
              <SidebarItem
                key={item.href}
                {...item}
                active={isActive(item.href)}
                onNavigate={handleLinkClick}
              />
            ))}
          </>
        )}

        {/* Platform section — owner only */}
        {isOwner && (
          <>
            <div className="px-2 pb-1 pt-5">
              <span className="crm-nav-label">Platform</span>
            </div>
            {platformNav.map((item) => (
              <SidebarItem
                key={item.href}
                {...item}
                active={isActive(item.href)}
                onNavigate={handleLinkClick}
              />
            ))}
          </>
        )}
      </nav>

      {/* Role badge + footer */}
      <div className="crm-sidebar-footer space-y-1 border-t border-surface-border px-3 py-4">
        {userRole && (
          <div className="px-3 py-1.5 mb-1">
            <span
              className={cn(
                'text-2xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded',
                isOwner
                  ? 'bg-gold-500/15 text-gold-400'
                  : isAdmin
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'bg-white/8 text-white/30'
              )}
            >
              {userRole}
            </span>
          </div>
        )}
        <a
          href="/logout"
          className={cn(
            'flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2.5',
            'text-white/45 transition-colors duration-150 hover:bg-red-500/[0.08] hover:text-red-300',
            'text-sm font-medium'
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          Sign out
        </a>
      </div>
    </aside>
  )
}

interface SidebarItemProps extends NavItem {
  active: boolean
  onNavigate?: () => void
}

function SidebarItem({ label, href, icon: Icon, active, onNavigate, badge }: SidebarItemProps) {
  return (
    <div className="ui-sidebar-item">
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          'relative flex min-h-10 items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium',
          'crm-nav-item transition-colors duration-150 focus-ring',
          active
            ? 'crm-nav-item-active border-brand/20 bg-brand/[0.09] text-white'
            : 'text-white/[0.52] hover:bg-white/[0.04] hover:text-white'
        )}
      >
        <span className={cn('crm-nav-icon', active && 'crm-nav-icon-active')} aria-hidden="true">
          <Icon
            className={cn('h-4 w-4 shrink-0', active ? 'text-brand' : 'text-white/[0.38]')}
            strokeWidth={1.75}
          />
        </span>
        <span className="truncate">{label}</span>
        {typeof badge === 'number' && badge > 0 && (
          <span className="ml-auto min-w-5 rounded-md bg-white/[0.07] px-1.5 text-center text-2xs font-semibold leading-5 text-white/65">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
        {active && (
          <span
            className="crm-nav-active-rail absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand"
            aria-hidden="true"
          />
        )}
      </Link>
    </div>
  )
}
