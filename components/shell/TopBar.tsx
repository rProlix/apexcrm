'use client'

import { Bell, Building2, ChevronDown, LogOut, Menu, Settings } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/utils'
import type { AnyRole } from '@/lib/auth/types'
import type { NavModule } from '@/modules/shared/moduleTypes'
import { GlobalCommandCenter } from '@/components/command-center/GlobalCommandCenter'
import { LiveOperationsPulse } from '@/components/command-center/OperationsRealtimeProvider'

interface TopBarProps {
  tenantName: string
  userEmail?: string
  userRole: AnyRole
  modules: NavModule[]
  isPlatformAdmin: boolean
  commandCenter: {
    inbox: boolean
    activity: boolean
    reports: boolean
    setup: boolean
    notifications: boolean
  }
  /** Called when the mobile hamburger is tapped */
  onMenuClick?: () => void
  unreadNotifications?: number
  notificationsEnabled?: boolean
  openActionCount?: number
  tenantLogoUrl?: string | null
}

export function TopBar({
  tenantName,
  userEmail,
  userRole,
  modules,
  isPlatformAdmin,
  commandCenter,
  onMenuClick,
  unreadNotifications = 0,
  notificationsEnabled = false,
  openActionCount = 0,
  tenantLogoUrl,
}: TopBarProps) {
  const name = userEmail?.split('@')[0] ?? 'User'
  const profileMenuRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const closeMenu = (restoreFocus: boolean) => {
      const menu = profileMenuRef.current
      if (!menu?.open) return
      menu.open = false
      if (restoreFocus) menu.querySelector<HTMLElement>('summary')?.focus()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu(true)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) closeMenu(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  return (
    <header
      className={cn(
        // Mobile: spans full width. Desktop: offset by sidebar width.
        'crm-topbar fixed left-0 right-0 top-0 h-16 md:left-64',
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
            'ui-chrome-button transition-colors duration-150 focus-ring'
          )}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" strokeWidth={1.75} />
        </button>

        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <div
            className={cn(
              'brand-accent-surface flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
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
            {!tenantLogoUrl && <Building2 className="h-3.5 w-3.5" aria-hidden="true" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-white/[0.72]">{tenantName}</p>
            <p className="text-2xs capitalize text-white/[0.32]">
              {userRole ?? 'workspace'} workspace
            </p>
          </div>
        </div>

        <div className="ml-2">
          <GlobalCommandCenter
            modules={modules}
            role={userRole}
            isPlatformAdmin={isPlatformAdmin}
            commandCenter={commandCenter}
            openActionCount={openActionCount}
          />
        </div>
      </div>

      {/* Right: notifications + user */}
      <div className="flex items-center gap-2">
        <LiveOperationsPulse className="hidden xl:flex" />

        {/* Notifications */}
        {notificationsEnabled && (
          <Link
            href="/notifications"
            aria-label={`${unreadNotifications} unread notifications`}
            className={cn(
              'relative flex h-10 w-10 items-center justify-center rounded-xl',
              'text-white/[0.42] hover:bg-white/[0.05] hover:text-white',
              'ui-chrome-button transition-colors duration-150 focus-ring'
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

        <details ref={profileMenuRef} className="group relative z-[var(--z-popover)]">
          <summary className="ui-chrome-button flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl px-1.5 text-white/80 transition-colors hover:bg-white/[0.04] focus-ring [&::-webkit-details-marker]:hidden">
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
          <div className="ui-popover-enter crm-popover absolute right-0 top-12 w-60 rounded-2xl border border-white/10 bg-graphite-800 p-2 shadow-panel-lg">
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
    </header>
  )
}
