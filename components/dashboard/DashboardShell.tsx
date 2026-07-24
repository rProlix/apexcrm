'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/shell/Sidebar'
import { TopBar } from '@/components/shell/TopBar'
import { BottomNav } from '@/components/shell/BottomNav'
import type { NavModule } from '@/modules/shared/moduleTypes'

interface DashboardShellProps {
  tenantName: string
  userEmail?: string
  userRole?: string
  modules: NavModule[]
  isPlatformAdmin?: boolean
  commandCenter?: CommandCenterNavConfig
  unreadNotifications?: number
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
  children,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-dvh bg-graphite-950">
      <Sidebar
        tenantName={tenantName}
        modules={modules}
        userRole={userRole}
        isPlatformAdmin={isPlatformAdmin}
        commandCenter={commandCenter}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
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
        unreadNotifications={unreadNotifications}
        notificationsEnabled={commandCenter?.notifications ?? false}
        onMenuClick={() => setSidebarOpen(true)}
      />

      {/* Main content: no left padding on mobile (sidebar overlays), pl-60 on desktop */}
      <main className="md:pl-60 pt-14 min-h-dvh">
        <div className="max-w-screen-2xl mx-auto px-4 md:px-6 py-8 pb-24 md:pb-8">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <BottomNav modules={modules} userRole={userRole} commandCenter={commandCenter} />
    </div>
  )
}
