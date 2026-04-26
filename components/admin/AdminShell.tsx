'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Shield, LayoutDashboard, Building2, LogOut, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdminShellProps {
  email:    string
  children: React.ReactNode
}

export function AdminShell({ email, children }: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-dvh bg-graphite-950 flex">

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 bottom-0 z-40 w-56',
          'flex flex-col border-r border-surface-border',
          'bg-graphite-900/95 backdrop-blur-xl',
          'transition-transform duration-300 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0'
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-surface-border">
          <div className="h-8 w-8 rounded-lg bg-gold-gradient flex items-center justify-center shrink-0">
            <Shield className="h-4 w-4 text-graphite-900" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Platform Admin</p>
            <p className="text-2xs text-white/30 truncate">{email}</p>
          </div>
          {/* Mobile close button */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden flex items-center justify-center h-7 w-7 rounded-lg text-white/30 hover:text-white hover:bg-graphite-700 transition-colors shrink-0"
            aria-label="Close sidebar"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <AdminNavItem href="/admin"         label="Overview"   icon={LayoutDashboard} onNavigate={() => setSidebarOpen(false)} />
          <AdminNavItem href="/admin/tenants" label="Businesses" icon={Building2}       onNavigate={() => setSidebarOpen(false)} />
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-surface-border space-y-1">
          <Link
            href="/dashboard"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/40 hover:text-white hover:bg-graphite-700 transition-colors"
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            Back to Dashboard
          </Link>
          <Link
            href="/logout"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/40 hover:text-red-400 hover:bg-red-500/8 transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            Sign out
          </Link>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-h-dvh md:pl-56">

        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 h-14 border-b border-surface-border bg-graphite-900/80 backdrop-blur-xl md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex items-center justify-center h-8 w-8 rounded-xl text-white/50 hover:text-white hover:bg-graphite-700 transition-colors"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-gold-gradient flex items-center justify-center shrink-0">
              <Shield className="h-3.5 w-3.5 text-graphite-900" strokeWidth={2} />
            </div>
            <span className="text-sm font-bold text-white">Platform Admin</span>
          </div>
        </header>

        <main className="flex-1">
          <div className="max-w-screen-xl mx-auto px-4 md:px-8 py-6 md:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

function AdminNavItem({
  href,
  label,
  icon: Icon,
  onNavigate,
}: {
  href:        string
  label:       string
  icon:        React.ElementType
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium',
        'text-white/50 hover:text-white hover:bg-graphite-700 transition-colors duration-150'
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-white/35" strokeWidth={1.75} />
      {label}
    </Link>
  )
}
