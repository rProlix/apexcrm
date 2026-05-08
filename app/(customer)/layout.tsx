export const dynamic = 'force-dynamic'

// app/(customer)/layout.tsx
import { headers } from 'next/headers'
import { getTenantFromHost } from '@/lib/tenant/getTenantFromHost'
import { getCustomerContext } from '@/lib/auth/customerGuard'
import { getCustomerPortalModules } from '@/lib/modules/customerPortalModules'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, CreditCard, Star, ShoppingBag, User } from 'lucide-react'

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const host   = (await headers()).get('host') ?? ''
  const tenant = await getTenantFromHost(host)

  if (!tenant) redirect('/')

  // Customer context (null = not signed in)
  const customerCtx = await getCustomerContext(host)

  // Load modules to show conditional nav items
  const mods = customerCtx
    ? await getCustomerPortalModules(tenant.id)
    : { appointments: false, orders: false, rewards: false, payments: false, profile: true }

  const navItems = [
    { key: 'appointments', enabled: mods.appointments, label: 'Appointments', href: '/portal/appointments', Icon: CalendarDays },
    { key: 'orders',       enabled: mods.orders,       label: 'Orders',        href: '/portal/customers/orders', Icon: ShoppingBag },
    { key: 'rewards',      enabled: mods.rewards,      label: 'Rewards',       href: '/rewards',                 Icon: Star        },
    { key: 'payments',     enabled: mods.payments,     label: 'Payments',      href: '/portal/payments',         Icon: CreditCard  },
    { key: 'profile',      enabled: true,              label: 'Profile',       href: '/portal/customers/profile', Icon: User       },
  ].filter(n => n.enabled)

  return (
    <div className="min-h-dvh bg-graphite-950">
      {/* Customer portal top bar */}
      <header className="border-b border-surface-border bg-graphite-900/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          {/* Brand */}
          <Link href="/portal" className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-gold-gradient flex items-center justify-center flex-shrink-0">
              <span className="text-graphite-900 font-bold text-xs">
                {tenant.name.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <span className="text-sm font-semibold text-white truncate hidden sm:block">{tenant.name}</span>
          </Link>

          {/* Nav — visible on desktop */}
          {customerCtx && navItems.length > 0 && (
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(item => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-white/50 hover:text-white hover:bg-white/8 transition-colors"
                >
                  <item.Icon className="w-3.5 h-3.5" />
                  {item.label}
                </Link>
              ))}
            </nav>
          )}

          {/* Right side */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {customerCtx && (
              <span className="text-xs text-white/40 truncate max-w-[120px] hidden sm:block">
                {customerCtx.email}
              </span>
            )}
            <span className="text-xs text-white/30 border border-white/10 rounded-lg px-2 py-1 hidden sm:block">
              Portal
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

        {/* Mobile nav */}
        {customerCtx && navItems.length > 0 && (
          <div className="md:hidden border-t border-white/6 px-4 py-2 flex items-center gap-1 overflow-x-auto scrollbar-none">
            {navItems.map(item => (
              <Link
                key={item.key}
                href={item.href}
                className="flex-shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-white/50 hover:text-white hover:bg-white/8 transition-colors"
              >
                <item.Icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  )
}
