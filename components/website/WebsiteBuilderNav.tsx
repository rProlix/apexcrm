'use client'
// components/website/WebsiteBuilderNav.tsx
// Persistent sub-navigation tabs for every page under /website/*

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid, FileText, Navigation, Palette, Settings,
  Download, Wand2, Sparkles, ImageIcon, Wand, History, Box,
  Camera, LayoutTemplate,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Tab {
  href:      string
  label:     string
  icon:      React.ElementType
  exact?:    boolean
  ownerOnly?: boolean
  badge?:    string
}

const TABS: Tab[] = [
  { href: '/website',            label: 'Overview',    icon: LayoutGrid,  exact: true },
  { href: '/website/create',     label: 'App Type',    icon: LayoutTemplate },
  { href: '/website/pov',        label: 'POV Apps',    icon: Camera, badge: 'NEW' },
  { href: '/website/pages',      label: 'Pages',       icon: FileText },
  { href: '/website/navigation', label: 'Navigation',  icon: Navigation },
  { href: '/website/theme',      label: 'Theme',       icon: Palette },
  { href: '/website/settings',   label: 'Settings',    icon: Settings },
  { href: '/website/ai-autofill',        label: 'AI Autofill',  icon: Sparkles,  badge: 'AI' },
  { href: '/website/ai-images',          label: 'AI Images',    icon: ImageIcon, badge: 'NEW' },
  { href: '/website/ai-premium-design',  label: 'AI Animations', icon: Wand,     badge: 'NEW' },
  { href: '/website/versions',           label: 'Versions',      icon: History,  badge: 'NEW' },
  { href: '/website/3d-diagnostics',     label: '3D Hero',       icon: Box,      badge: 'NEW' },
  { href: '/website/import',             label: 'Import',        icon: Download, ownerOnly: true },
]

interface Props {
  userRole?: string
}

export function WebsiteBuilderNav({ userRole }: Props) {
  const pathname = usePathname()
  const isOwner  = userRole === 'owner'

  const tabs = TABS.filter((t) => !t.ownerOnly || isOwner)

  function isActive(href: string, exact = false): boolean {
    if (exact) return pathname === href
    // for nested paths like /website/settings/domain, match /website/settings
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-graphite-950/95 backdrop-blur-xl border-b border-surface-border">
      <div
        className="flex items-center gap-0.5 overflow-x-auto scrollbar-none"
        role="navigation"
        aria-label="Website Builder sections"
      >
        {tabs.map((tab) => {
          const active = isActive(tab.href, tab.exact)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-150 shrink-0 group',
                active
                  ? 'bg-gold-500/10 text-gold-400 border border-gold-500/20'
                  : 'text-white/45 hover:text-white/80 hover:bg-white/5 border border-transparent',
              )}
            >
              <tab.icon
                className={cn(
                  'h-3.5 w-3.5 shrink-0 transition-colors duration-150',
                  active ? 'text-gold-400' : 'text-white/30 group-hover:text-white/60',
                )}
                strokeWidth={1.75}
              />
              {tab.label}
              {tab.badge && (
                <span
                  className={cn(
                    'text-2xs font-bold px-1 py-0.5 rounded uppercase tracking-wide leading-none',
                    active
                      ? 'bg-gold-500/20 text-gold-300'
                      : 'bg-violet-500/20 text-violet-400',
                  )}
                >
                  {tab.badge}
                </span>
              )}
              {active && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-gold-400" />
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
