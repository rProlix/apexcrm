// app/(customer)/layout.tsx
import { headers } from 'next/headers'
import { getTenantFromHost } from '@/lib/tenant/getTenantFromHost'
import { getCustomerContext } from '@/lib/auth/customerGuard'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const host   = headers().get('host') ?? ''
  const tenant = await getTenantFromHost(host)

  if (!tenant) redirect('/')

  // Attempt to load the customer session; if not authenticated, show gated UI
  const customerCtx = await getCustomerContext(host)

  return (
    <div className="min-h-dvh bg-graphite-950">
      {/* Customer portal top bar */}
      <header className="border-b border-surface-border bg-graphite-900/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gold-gradient flex items-center justify-center">
              <span className="text-graphite-900 font-bold text-xs">
                {tenant.name.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <span className="text-sm font-semibold text-white">{tenant.name}</span>
          </div>
          <div className="flex items-center gap-3">
            {customerCtx && (
              <span className="text-xs text-white/40 truncate max-w-[140px]">
                {customerCtx.email}
              </span>
            )}
            <span className="text-xs text-white/30 border border-white/10 rounded-lg px-2 py-1">
              Customer Portal
            </span>
            {customerCtx ? (
              <Link
                href="/logout"
                className="text-xs text-white/40 hover:text-red-400 transition-colors"
              >
                Sign out
              </Link>
            ) : (
              <Link
                href="/login?next=/portal"
                className="text-xs font-semibold text-gold-400 border border-gold-500/30 rounded-lg px-3 py-1 hover:bg-gold-500/8 transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
