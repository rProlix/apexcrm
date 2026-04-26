'use client'

import { motion } from 'framer-motion'
import { Bell, Search, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/utils'
import { fadeIn } from '@/lib/motion'

interface TopBarProps {
  tenantName: string
  userEmail?: string
  userRole?:  string
}

export function TopBar({ tenantName: _tenantName, userEmail, userRole }: TopBarProps) {
  const name = userEmail?.split('@')[0] ?? 'User'

  return (
    <motion.header
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className={cn(
        'fixed top-0 right-0 left-60 z-20 h-14',
        'flex items-center justify-between px-6',
        'bg-graphite-900/80 backdrop-blur-xl border-b border-surface-border'
      )}
    >
      {/* Left: search */}
      <div className="flex items-center gap-2">
        <button
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-xl',
            'bg-graphite-800 border border-surface-border text-white/35',
            'text-sm hover:border-gold-500/30 hover:text-white/60',
            'transition-colors duration-150 focus-ring'
          )}
        >
          <Search className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="text-xs">Search…</span>
          <span className="ml-2 text-2xs text-white/20 border border-white/10 rounded px-1">⌘K</span>
        </button>
      </div>

      {/* Right: notifications + user */}
      <div className="flex items-center gap-3">
        {/* Notifications */}
        <button
          className={cn(
            'relative h-8 w-8 rounded-xl flex items-center justify-center',
            'text-white/35 hover:text-white hover:bg-graphite-700',
            'transition-colors duration-150 focus-ring'
          )}
        >
          <Bell className="h-4 w-4" strokeWidth={1.75} />
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-gold-400 border-2 border-graphite-900" />
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-surface-border" />

        {/* User avatar + name */}
        <button
          className={cn(
            'flex items-center gap-2.5 rounded-xl px-2 py-1',
            'hover:bg-graphite-700 transition-colors duration-150 focus-ring'
          )}
        >
          <div className="h-7 w-7 rounded-lg bg-gold-gradient flex items-center justify-center shrink-0">
            <span className="text-graphite-900 text-xs font-bold">{initials(name)}</span>
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-xs font-semibold text-white/80 capitalize">{name}</p>
            {userRole && (
              <p className="text-2xs text-white/30 capitalize">{userRole}</p>
            )}
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-white/25" strokeWidth={2} />
        </button>
      </div>
    </motion.header>
  )
}
