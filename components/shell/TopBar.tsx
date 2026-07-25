'use client'

import { motion } from 'framer-motion'
import { Bell, Building2, ChevronDown, LogOut, Menu, Search, Settings } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/utils'
import { fadeIn } from '@/lib/motion'

interface TopBarProps {
  tenantName: string
  userEmail?: string
  userRole?: string
  /** Called when the mobile hamburger is tapped */
  onMenuClick?: () => void
  unreadNotifications?: number
  notificationsEnabled?: boolean
  actionSearchEnabled?: boolean
  openActionCount?: number
}

export function TopBar({
  tenantName,
  userEmail,
  userRole,
  onMenuClick,
  unreadNotifications = 0,
  notificationsEnabled = false,
  actionSearchEnabled = false,
  openActionCount = 0,
}: TopBarProps) {
  const name = userEmail?.split('@')[0] ?? 'User'

  return (
    <motion.header
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className={cn(
        // Mobile: spans full width. Desktop: offset by sidebar width.
        'fixed left-0 right-0 top-0 z-20 h-16 md:left-64',
        'flex items-center justify-between px-4 md:px-6',
        'border-b border-white/[0.065] bg-graphite-900/88 backdrop-blur-xl'
      )}
    >
      {/* Left: hamburger (mobile) + search */}
      <div className="flex min-w-0 items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl md:hidden',
            'text-white/50 hover:bg-white/[0.05] hover:text-white',
            'transition-colors duration-150 focus-ring'
          )}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" strokeWidth={1.75} />
        </button>

        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <Building2 className="h-4 w-4 shrink-0 text-white/30" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-white/[0.72]">{tenantName}</p>
            <p className="text-2xs capitalize text-white/[0.32]">{userRole ?? 'workspace'}</p>
          </div>
        </div>

        {actionSearchEnabled && (
          <Link
            href="/actions"
            className={cn(
              'ml-2 hidden min-h-9 items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-3 text-white/40 lg:flex',
              'text-sm hover:border-brand/25 hover:bg-white/[0.04] hover:text-white/65',
              'transition-colors duration-150 focus-ring'
            )}
          >
            <Search className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="text-xs">Search actions</span>
            {openActionCount > 0 && (
              <span className="rounded-md bg-brand/[0.12] px-1.5 text-2xs font-semibold leading-5 text-brand">
                {openActionCount > 99 ? '99+' : openActionCount}
              </span>
            )}
          </Link>
        )}
      </div>

      {/* Right: notifications + user */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        {notificationsEnabled && (
          <Link
            href="/notifications"
            aria-label={`${unreadNotifications} unread notifications`}
            className={cn(
              'relative flex h-10 w-10 items-center justify-center rounded-xl',
              'text-white/[0.42] hover:bg-white/[0.05] hover:text-white',
              'transition-colors duration-150 focus-ring'
            )}
          >
            <Bell className="h-4 w-4" strokeWidth={1.75} />
            {unreadNotifications > 0 && (
              <span className="absolute right-0 top-0 min-w-4 rounded-md border border-graphite-900 bg-brand px-1 text-center text-[9px] font-bold leading-4 text-brand-foreground">
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            )}
          </Link>
        )}

        {/* Divider */}
        <div className="mx-1 hidden h-6 w-px bg-white/8 sm:block" />

        <details className="group relative">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl px-1.5 text-white/80 transition-colors hover:bg-white/[0.04] focus-ring [&::-webkit-details-marker]:hidden">
            <div className="brand-accent-surface flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
              <span className="text-xs font-bold">{initials(name)}</span>
            </div>
            <div className="hidden min-w-0 text-left sm:block">
              <p className="max-w-32 truncate text-xs font-semibold capitalize text-white/[0.82]">
                {name}
              </p>
              {userRole && <p className="text-2xs capitalize text-white/35">{userRole}</p>}
            </div>
            <ChevronDown className="hidden h-3.5 w-3.5 text-white/30 transition-transform group-open:rotate-180 sm:block" />
          </summary>
          <div className="absolute right-0 top-12 z-50 w-56 rounded-2xl border border-white/10 bg-graphite-800 p-2 shadow-panel-lg">
            <div className="border-b border-white/[0.07] px-3 py-2.5">
              <p className="truncate text-xs font-medium text-white/75">{userEmail}</p>
              <p className="mt-0.5 truncate text-2xs text-white/35">{tenantName}</p>
            </div>
            <Link href="/settings" className="ui-button-ghost mt-1 w-full justify-start">
              <Settings className="h-4 w-4" />
              Workspace settings
            </Link>
            <a
              href="/logout"
              className="mt-0.5 flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-red-300/75 hover:bg-red-400/[0.08] hover:text-red-200"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </a>
          </div>
        </details>
      </div>
    </motion.header>
  )
}
