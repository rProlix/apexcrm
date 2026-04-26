export const dynamic = 'force-dynamic'

// app/(admin)/layout.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUserContext } from '@/lib/auth/getUserContext'
import { Shield, LayoutDashboard, Building2, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Platform Admin — ApexCRM' }

/**
 * Owner-only layout guard.
 * Any child route under (admin)/ will redirect to /dashboard?error=forbidden
 * unless the authenticated user holds the 'owner' role.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getUserContext()

  if (!ctx) {
    redirect('/login')
  }

  if (ctx.role !== 'owner') {
    redirect('/dashboard?error=forbidden')
  }

  return (
    <div className="min-h-dvh bg-graphite-950 flex">
      {/* Platform admin sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 z-30 w-56 flex flex-col border-r border-surface-border bg-graphite-900/95 backdrop-blur-xl">
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-surface-border">
          <div className="h-8 w-8 rounded-lg bg-gold-gradient flex items-center justify-center shrink-0">
            <Shield className="h-4 w-4 text-graphite-900" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Platform Admin</p>
            <p className="text-2xs text-white/30 truncate max-w-[120px]">{ctx.email}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <AdminNavItem href="/admin" label="Overview" icon={LayoutDashboard} />
          <AdminNavItem href="/admin/tenants" label="Businesses" icon={Building2} />
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-surface-border space-y-1">
          <Link
            href="/dashboard"
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

      {/* Main content */}
      <main className="pl-56 min-h-dvh w-full">
        <div className="max-w-screen-xl mx-auto px-8 py-10">
          {children}
        </div>
      </main>
    </div>
  )
}

function AdminNavItem({
  href,
  label,
  icon: Icon,
}: {
  href: string
  label: string
  icon: React.ElementType
}) {
  return (
    <Link
      href={href}
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
