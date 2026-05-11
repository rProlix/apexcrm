// components/appointments/AppointmentsSubNav.tsx
// Persistent sub-navigation rendered inside the appointments layout.
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, List, Clock, Settings, LayoutGrid } from 'lucide-react'

const LINKS = [
  { href: '/appointments',              label: 'Overview',     icon: LayoutGrid,  exact: true  },
  { href: '/appointments/calendar',     label: 'Calendar',     icon: CalendarDays, exact: false },
  { href: '/appointments/list',         label: 'List',         icon: List,         exact: false },
  { href: '/appointments/availability', label: 'Availability', icon: Clock,        exact: false },
  { href: '/appointments/settings',     label: 'Settings',     icon: Settings,     exact: false },
]

export function AppointmentsSubNav() {
  const pathname = usePathname()

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  return (
    <nav className="flex items-center gap-0.5 bg-graphite-800/60 border border-surface-border rounded-xl p-1 overflow-x-auto no-scrollbar">
      {LINKS.map(({ href, label, icon: Icon, exact }) => {
        const active = isActive(href, exact)
        return (
          <Link
            key={href}
            href={href}
            className={`
              flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-all
              ${active
                ? 'bg-gold-gradient text-graphite-900 shadow-sm'
                : 'text-white/50 hover:text-white hover:bg-graphite-700/50'
              }
            `}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {label}
            {href === '/appointments/availability' && !active && (
              <span className="ml-1 h-1.5 w-1.5 rounded-full bg-gold-400 shrink-0" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
