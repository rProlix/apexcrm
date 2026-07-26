'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Settings,
  Layers,
  CreditCard,
  CalendarDays,
  Star,
  Car,
  ScanLine,
  UserPlus,
  MessageSquare,
  BookUser,
  ShoppingBag,
  UserCheck,
  Globe,
  Rotate3D,
  Inbox,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
  store: ShoppingBag,
  customers: UserCheck,
  website: Globe,
  product_360: Rotate3D,
}

interface BottomNavProps {
  modules: NavModule[]
  userRole?: string
  commandCenter?: CommandCenterNavConfig
  openActionCount?: number
}

export function BottomNav({
  modules,
  userRole,
  commandCenter,
  openActionCount = 0,
}: BottomNavProps) {
  const pathname = usePathname()

  // Show at most 3 module shortcuts alongside the 2 fixed items
  const visibleModules = modules.slice(0, 3)

  const items = [
    { label: 'Home', href: '/dashboard', icon: LayoutDashboard },
    ...(commandCenter?.inbox
      ? [{ label: 'Actions', href: '/actions', icon: Inbox, badge: openActionCount }]
      : []),
    ...visibleModules
      .slice(0, commandCenter?.inbox ? 2 : 3)
      .map((m) => ({ label: m.label, href: m.href, icon: MODULE_ICONS[m.key] ?? Layers })),
    ...(['owner', 'admin', 'manager'].includes(userRole ?? '')
      ? [{ label: 'Settings', href: '/settings', icon: Settings }]
      : []),
  ]

  return (
    <nav
      className={cn(
        'crm-bottom-nav fixed bottom-0 left-0 right-0 z-40 md:hidden',
        'flex min-h-16 items-center justify-around',
        'border-t border-white/[0.07] bg-graphite-900/95 backdrop-blur-xl',
        'safe-area-bottom'
      )}
    >
      {items.map((item) => {
        const Icon = item.icon
        const active =
          pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'relative flex min-h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5',
              'transition-colors duration-150',
              active ? 'bg-brand/[0.08] text-brand' : 'text-white/[0.42] hover:text-white/70'
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-2xs font-medium">{item.label}</span>
            {'badge' in item && typeof item.badge === 'number' && item.badge > 0 && (
              <span className="absolute right-0.5 top-0 min-w-4 rounded-md bg-red-400 px-1 text-center text-[9px] font-bold leading-4 text-graphite-950">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
