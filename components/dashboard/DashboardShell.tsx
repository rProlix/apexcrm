'use client'

import { MotionConfig } from 'framer-motion'
import { useState } from 'react'
import { Sidebar } from '@/components/shell/Sidebar'
import { TopBar } from '@/components/shell/TopBar'
import { BottomNav } from '@/components/shell/BottomNav'
import type { NavModule } from '@/modules/shared/moduleTypes'
import type { SafeTenantAccent } from '@/lib/design-system/tenantAccent'
import type { AnyRole } from '@/lib/auth/types'
import { QuickPeekProvider } from '@/components/command-center/QuickPeek'
import { OperationsRealtimeProvider } from '@/components/command-center/OperationsRealtimeProvider'

interface DashboardShellProps {
  tenantId: string
  tenantName: string
  userEmail?: string
  userRole: AnyRole
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
  tenantId,
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
    <MotionConfig reducedMotion="user">
      <OperationsRealtimeProvider
        tenantId={tenantId}
        activeModuleKeys={modules.map((module) => module.key)}
      >
        <QuickPeekProvider>
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

            {sidebarOpen && (
              <button
                type="button"
                aria-label="Close navigation"
                className="ui-overlay-backdrop fixed inset-0 z-30 h-full w-full cursor-default md:hidden"
                onClick={() => setSidebarOpen(false)}
              />
            )}

            <TopBar
              tenantName={tenantName}
              userEmail={userEmail}
              userRole={userRole}
              modules={modules}
              isPlatformAdmin={Boolean(isPlatformAdmin)}
              commandCenter={
                commandCenter ?? {
                  inbox: false,
                  activity: false,
                  reports: false,
                  setup: false,
                  notifications: false,
                }
              }
              openActionCount={openActionCount}
              unreadNotifications={unreadNotifications}
              notificationsEnabled={commandCenter?.notifications ?? false}
              onMenuClick={() => setSidebarOpen(true)}
            />

            <main className="min-h-dvh pt-16 md:pl-64">
              <div className="ui-page px-[var(--space-page-x)] py-[var(--space-page-y)] pb-24 md:pb-9">
                {children}
              </div>
            </main>

            <BottomNav
              modules={modules}
              userRole={userRole}
              commandCenter={commandCenter}
              openActionCount={openActionCount}
            />
          </div>
        </QuickPeekProvider>
      </OperationsRealtimeProvider>
    </MotionConfig>
  )
}
