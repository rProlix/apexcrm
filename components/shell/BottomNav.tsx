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
}

export function BottomNav({ modules, userRole, commandCenter }: BottomNavProps) {
  const pathname = usePathname()

  // Show at most 3 module shortcuts alongside the 2 fixed items
  const visibleModules = modules.slice(0, 3)

  const items = [
    { label: 'Home', href: '/dashboard', icon: LayoutDashboard },
    ...(commandCenter?.inbox ? [{ label: 'Actions', href: '/actions', icon: MessageSquare }] : []),
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
        'fixed bottom-0 left-0 right-0 z-40 md:hidden',
        'flex items-center justify-around',
        'h-16 bg-graphite-900/95 backdrop-blur-xl border-t border-surface-border',
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
              'flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl',
              'transition-colors duration-150',
              active ? 'text-gold-400' : 'text-white/35 hover:text-white/60'
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-2xs font-medium">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
