import { Sidebar } from '@/components/shell/Sidebar'
import { TopBar } from '@/components/shell/TopBar'
import { BottomNav } from '@/components/shell/BottomNav'
import type { NavModule } from '@/modules/shared/moduleTypes'

interface DashboardShellProps {
  tenantName:       string
  userEmail?:       string
  userRole?:        string
  modules:          NavModule[]
  isPlatformAdmin?: boolean
  children:         React.ReactNode
}

export function DashboardShell({
  tenantName,
  userEmail,
  userRole,
  modules,
  isPlatformAdmin,
  children,
}: DashboardShellProps) {
  return (
    <div className="min-h-dvh bg-graphite-950">
      <Sidebar
        tenantName={tenantName}
        modules={modules}
        userRole={userRole}
        isPlatformAdmin={isPlatformAdmin}
      />
      <TopBar
        tenantName={tenantName}
        userEmail={userEmail}
        userRole={userRole}
      />

      {/* Main content offset for sidebar + topbar */}
      <main className="pl-60 pt-14 min-h-dvh">
        <div className="max-w-screen-2xl mx-auto px-6 py-8 pb-24 md:pb-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <BottomNav modules={modules} />
    </div>
  )
}
