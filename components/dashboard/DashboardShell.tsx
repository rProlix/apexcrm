'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/shell/Sidebar'
import { TopBar } from '@/components/shell/TopBar'
import { BottomNav } from '@/components/shell/BottomNav'
import type { NavModule } from '@/modules/shared/moduleTypes'
import type { SafeTenantAccent } from '@/lib/design-system/tenantAccent'

interface DashboardShellProps {
  tenantName: string
  userEmail?: string
  userRole?: string
  modules: NavModule[]
  isPlatformAdmin?: boolean
  commandCenter?: CommandCenterNavConfig
  unreadNotifications?: number
  openActionCount?: number
  tenantLogoUrl?: string | null
  tenantAccent: SafeTenantAccent
  children: React.ReactNode
}

export interface CommandCenterNavConfig {
  inbox: boolean
  activity: boolean
  reports: boolean
  setup: boolean
  notifications: boolean
}

export function DashboardShell({
  tenantName,
  userEmail,
  userRole,
  modules,
  isPlatformAdmin,
  commandCenter,
  unreadNotifications = 0,
  openActionCount = 0,
  tenantLogoUrl,
  tenantAccent,
  children,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div
      className="min-h-dvh bg-graphite-950"
      style={
        {
          '--tenant-accent': tenantAccent.accent,
          '--tenant-accent-rgb': tenantAccent.accentRgb,
          '--tenant-accent-foreground': tenantAccent.foreground,
        } as React.CSSProperties
      }
    >
      <Sidebar
        tenantName={tenantName}
        tenantLogoUrl={tenantLogoUrl}
        modules={modules}
        userRole={userRole}
        isPlatformAdmin={isPlatformAdmin}
        commandCenter={commandCenter}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        openActionCount={openActionCount}
      />

      {/* Mobile overlay — tapping outside closes the drawer */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <TopBar
        tenantName={tenantName}
        userEmail={userEmail}
        userRole={userRole}
        actionSearchEnabled={commandCenter?.inbox ?? false}
        openActionCount={openActionCount}
        unreadNotifications={unreadNotifications}
        notificationsEnabled={commandCenter?.notifications ?? false}
        onMenuClick={() => setSidebarOpen(true)}
      />

      {/* Main content: no left padding on mobile (sidebar overlays), pl-60 on desktop */}
      <main className="min-h-dvh pt-16 md:pl-64">
        <div className="ui-page px-[var(--space-page-x)] py-[var(--space-page-y)] pb-24 md:pb-9">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <BottomNav
        modules={modules}
        userRole={userRole}
        commandCenter={commandCenter}
        openActionCount={openActionCount}
      />
    </div>
  )
}
