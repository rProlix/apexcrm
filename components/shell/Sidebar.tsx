'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
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
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { sidebarItemHover } from '@/lib/motion'
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
  modules: NavModule[]
  userRole?: string
  isPlatformAdmin?: boolean
  /** Controlled open state (mobile drawer) */
  isOpen?: boolean
  /** Called when user closes the drawer (mobile) */
  onClose?: () => void
  commandCenter?: CommandCenterNavConfig
}

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  exact?: boolean
  /** Minimum roles that can see this item. Omit to show to everyone. */
  roles?: string[]
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
  { label: 'Plans', href: '/owner/plans', icon: CreditCard },
]

export function Sidebar({
  tenantName,
  modules,
  userRole,
  isPlatformAdmin,
  isOpen = false,
  onClose,
  commandCenter,
}: SidebarProps) {
  const pathname = usePathname()
  const isOwner = isPlatformAdmin || userRole === 'owner'
  const isAdmin = isOwner || userRole === 'admin'
  const commandNav: NavItem[] = [
    ...(commandCenter?.inbox ? [{ label: 'Action Required', href: '/actions', icon: Inbox }] : []),
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
        'fixed left-0 top-0 bottom-0 z-40 w-60',
        'flex flex-col border-r border-surface-border',
        'bg-graphite-900/95 backdrop-blur-xl',
        // CSS-only transition so Framer Motion cannot override translateX
        'transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop: always visible, ignore isOpen
        'md:translate-x-0'
      )}
    >
      {/* Logo / tenant name */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-surface-border">
        <div className="h-8 w-8 rounded-lg bg-gold-gradient flex items-center justify-center shrink-0">
          <span className="text-graphite-900 font-bold text-xs">
            {tenantName.slice(0, 2).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{tenantName}</p>
          <LiveBadge label="Active" className="mt-0.5" />
        </div>
        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="md:hidden flex items-center justify-center h-7 w-7 rounded-lg text-white/30 hover:text-white hover:bg-graphite-700 transition-colors shrink-0"
          aria-label="Close sidebar"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
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
            <div className="pt-4 pb-1 px-2">
              <span className="text-2xs font-semibold text-white/25 uppercase tracking-widest">
                Modules
              </span>
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
            <div className="pt-4 pb-1 px-2">
              <span className="text-2xs font-semibold text-white/25 uppercase tracking-widest">
                Management
              </span>
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
            <div className="pt-4 pb-1 px-2">
              <span className="text-2xs font-semibold text-white/25 uppercase tracking-widest">
                Platform
              </span>
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
      <div className="px-3 py-4 border-t border-surface-border space-y-1">
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
        <motion.a
          href="/logout"
          initial="rest"
          whileHover="hover"
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl',
            'text-white/40 hover:text-red-400 hover:bg-red-500/8 transition-colors duration-150',
            'text-sm font-medium'
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          Sign out
        </motion.a>
      </div>
    </aside>
  )
}

interface SidebarItemProps extends NavItem {
  active: boolean
  onNavigate?: () => void
}

function SidebarItem({ label, href, icon: Icon, active, onNavigate }: SidebarItemProps) {
  return (
    <motion.div initial="rest" whileHover="hover" variants={sidebarItemHover}>
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium',
          'transition-colors duration-150 focus-ring',
          active
            ? 'bg-gold-500/12 text-gold-400 border border-gold-500/20'
            : 'text-white/50 hover:text-white hover:bg-graphite-700'
        )}
      >
        <Icon
          className={cn('h-4 w-4 shrink-0', active ? 'text-gold-400' : 'text-white/35')}
          strokeWidth={1.75}
        />
        {label}
        {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold-400" />}
      </Link>
    </motion.div>
  )
}
