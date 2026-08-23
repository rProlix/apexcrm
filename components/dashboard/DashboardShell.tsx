'use client'

import { MotionConfig } from 'framer-motion'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Sidebar } from '@/components/shell/Sidebar'
import { TopBar } from '@/components/shell/TopBar'
import { BottomNav } from '@/components/shell/BottomNav'
import { NavigationFeedback } from '@/components/shell/NavigationFeedback'
import { ShellAtmosphere } from '@/components/shell/ShellAtmosphere'
import { SurfaceEffects } from '@/components/shell/SurfaceEffects'
import type { NavModule } from '@/modules/shared/moduleTypes'
import type { SafeTenantAccent } from '@/lib/design-system/tenantAccent'
import type { AnyRole } from '@/lib/auth/types'
import { QuickPeekProvider } from '@/components/command-center/QuickPeek'
import { OperationsRealtimeProvider } from '@/components/command-center/OperationsRealtimeProvider'
import { WorkspaceDocumentBranding } from '@/components/shell/WorkspaceDocumentBranding'
import { useBodyScrollLock } from '@/lib/design-system/body-scroll-lock'
import { AppLaunchScreen } from '@/components/ui/AppLaunchScreen'

const SIDEBAR_COOKIE = 'apex_sidebar'

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
  tenantFaviconUrl?: string | null
  tenantAccent: SafeTenantAccent
  initialSidebarCollapsed?: boolean
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
  tenantFaviconUrl,
  tenantAccent,
  initialSidebarCollapsed = false,
  children,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSidebarCollapsed)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  useBodyScrollLock(sidebarOpen)

  const closeMobileNavigation = useCallback((restoreFocus = true) => {
    setSidebarOpen((wasOpen) => {
      if (wasOpen && restoreFocus) {
        window.requestAnimationFrame(() => menuButtonRef.current?.focus())
      }
      return false
    })
  }, [])

  useEffect(() => {
    if (!sidebarOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeMobileNavigation(true)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeMobileNavigation, sidebarOpen])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current
      const secure = window.location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `${SIDEBAR_COOKIE}=${next ? 'compact' : 'full'}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
      return next
    })
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <OperationsRealtimeProvider
        tenantId={tenantId}
        activeModuleKeys={modules.map((module) => module.key)}
      >
        <QuickPeekProvider>
          <div
            className="crm-shell min-h-dvh bg-graphite-950"
            data-sidebar-collapsed={sidebarCollapsed}
            style={
              {
                '--tenant-accent': tenantAccent.accent,
                '--tenant-accent-rgb': tenantAccent.accentRgb,
                '--tenant-accent-foreground': tenantAccent.foreground,
                '--tenant-accent-hover': tenantAccent.hover,
                '--tenant-accent-active': tenantAccent.active,
                '--tenant-accent-soft': tenantAccent.soft,
                '--tenant-focus': tenantAccent.focus,
                ...Object.fromEntries(
                  Object.entries(tenantAccent.scaleRgb).map(([step, rgb]) => [
                    `--tenant-accent-${step}-rgb`,
                    rgb,
                  ])
                ),
              } as React.CSSProperties
            }
          >
            <WorkspaceDocumentBranding
              tenantName={tenantName}
              faviconUrl={tenantFaviconUrl ?? tenantLogoUrl}
            />
            <AppLaunchScreen tenantName={tenantName} logoUrl={tenantLogoUrl} />
            <div className="crm-shell-ambient" aria-hidden="true">
              <span className="crm-shell-glow crm-shell-glow-primary" />
              <span className="crm-shell-glow crm-shell-glow-secondary" />
              <span className="crm-shell-grid" />
              <span className="crm-shell-horizon" />
              <ShellAtmosphere />
            </div>
            <SurfaceEffects />
            <Sidebar
              tenantName={tenantName}
              tenantLogoUrl={tenantLogoUrl}
              modules={modules}
              userRole={userRole}
              isPlatformAdmin={isPlatformAdmin}
              commandCenter={commandCenter}
              isOpen={sidebarOpen}
              onClose={() => closeMobileNavigation(true)}
              openActionCount={openActionCount}
              isCollapsed={sidebarCollapsed}
              onToggleCollapsed={toggleSidebar}
            />

            <button
              type="button"
              aria-label="Close navigation"
              aria-hidden={!sidebarOpen}
              tabIndex={sidebarOpen ? 0 : -1}
              className={`ui-mobile-backdrop ui-overlay-backdrop fixed inset-0 z-30 h-full w-full cursor-default md:hidden ${
                sidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
              }`}
              onClick={() => closeMobileNavigation(true)}
            />

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
              tenantLogoUrl={tenantLogoUrl}
              unreadNotifications={unreadNotifications}
              notificationsEnabled={commandCenter?.notifications ?? false}
              onMenuClick={() => setSidebarOpen(true)}
              menuButtonRef={menuButtonRef}
              mobileNavigationOpen={sidebarOpen}
            />

            <Suspense fallback={null}>
              <NavigationFeedback />
            </Suspense>

            <main className="crm-content min-h-dvh pt-16 md:pl-[var(--sidebar-width)]">
              <div className="ui-page px-[var(--space-page-x)] py-[var(--space-page-y)] pb-24 md:pb-10">
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
