'use client'

import { motion } from 'framer-motion'
import { Bell, Menu, Search } from 'lucide-react'
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
}

export function TopBar({
  tenantName: _tenantName,
  userEmail,
  userRole,
  onMenuClick,
  unreadNotifications = 0,
  notificationsEnabled = false,
  actionSearchEnabled = false,
}: TopBarProps) {
  const name = userEmail?.split('@')[0] ?? 'User'

  return (
    <motion.header
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className={cn(
        // Mobile: spans full width. Desktop: offset by sidebar width.
        'fixed top-0 right-0 left-0 md:left-60 z-20 h-14',
        'flex items-center justify-between px-4 md:px-6',
        'bg-graphite-900/80 backdrop-blur-xl border-b border-surface-border'
      )}
    >
      {/* Left: hamburger (mobile) + search */}
      <div className="flex items-center gap-2">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className={cn(
            'md:hidden flex items-center justify-center h-8 w-8 rounded-xl',
            'text-white/50 hover:text-white hover:bg-graphite-700',
            'transition-colors duration-150 focus-ring'
          )}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" strokeWidth={1.75} />
        </button>

        {actionSearchEnabled && (
          <Link
            href="/actions"
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-xl',
              'bg-graphite-800 border border-surface-border text-white/35',
              'text-sm hover:border-gold-500/30 hover:text-white/60',
              'transition-colors duration-150 focus-ring'
            )}
          >
            <Search className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="hidden text-xs sm:inline">Search action items</span>
          </Link>
        )}
      </div>

      {/* Right: notifications + user */}
      <div className="flex items-center gap-3">
        {/* Notifications */}
        {notificationsEnabled && (
          <Link
            href="/notifications"
            aria-label={`${unreadNotifications} unread notifications`}
            className={cn(
              'relative h-8 w-8 rounded-xl flex items-center justify-center',
              'text-white/35 hover:text-white hover:bg-graphite-700',
              'transition-colors duration-150 focus-ring'
            )}
          >
            <Bell className="h-4 w-4" strokeWidth={1.75} />
            {unreadNotifications > 0 && (
              <span className="absolute -right-1 -top-1 min-w-4 rounded-full border border-graphite-900 bg-gold-400 px-1 text-center text-[9px] font-bold leading-4 text-graphite-950">
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            )}
          </Link>
        )}

        {/* Divider */}
        <div className="h-6 w-px bg-surface-border" />

        {/* User avatar + name */}
        <div className={cn('flex items-center gap-2.5 rounded-xl px-2 py-1', 'text-white/80')}>
          <div className="h-7 w-7 rounded-lg bg-gold-gradient flex items-center justify-center shrink-0">
            <span className="text-graphite-900 text-xs font-bold">{initials(name)}</span>
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-xs font-semibold text-white/80 capitalize">{name}</p>
            {userRole && <p className="text-2xs text-white/30 capitalize">{userRole}</p>}
          </div>
        </div>
      </div>
    </motion.header>
  )
}
