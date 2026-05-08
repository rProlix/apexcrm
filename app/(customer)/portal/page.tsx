export const dynamic = 'force-dynamic'

import { headers } from 'next/headers'
import { getTenantFromHost } from '@/lib/tenant/getTenantFromHost'
import { getCustomerContext } from '@/lib/auth/customerGuard'
import { getCustomerPortalModules } from '@/lib/modules/customerPortalModules'
import { Card } from '@/components/ui/Card'
import { CalendarDays, CreditCard, Star, ShoppingBag, User, LogIn } from 'lucide-react'
import Link from 'next/link'

export default async function CustomerPortalPage() {
  const host   = (await headers()).get('host') ?? ''
  const tenant = await getTenantFromHost(host)

  // Load customer context (null if not signed in)
  const customerCtx = await getCustomerContext(host)

  // Load enabled modules for this tenant
  const mods = tenant
    ? await getCustomerPortalModules(tenant.id)
    : { appointments: false, orders: false, rewards: false, payments: false, profile: true }

  const allSections = [
    {
      key:         'appointments',
      enabled:     mods.appointments,
      label:       'Appointments',
      description: 'View and manage your upcoming bookings',
      icon:        CalendarDays,
      href:        '/portal/appointments',
      color:       'text-blue-400',
      bgColor:     'bg-blue-400/10',
    },
    {
      key:         'orders',
      enabled:     mods.orders,
      label:       'Orders',
      description: 'Track your orders and purchase history',
      icon:        ShoppingBag,
      href:        '/portal/customers/orders',
      color:       'text-amber-400',
      bgColor:     'bg-amber-400/10',
    },
    {
      key:         'rewards',
      enabled:     mods.rewards,
      label:       'Rewards',
      description: 'Check your loyalty points and history',
      icon:        Star,
      href:        '/rewards',
      color:       'text-yellow-400',
      bgColor:     'bg-yellow-400/10',
    },
    {
      key:         'payments',
      enabled:     mods.payments,
      label:       'Payments',
      description: 'View invoices and payment history',
      icon:        CreditCard,
      href:        '/portal/payments',
      color:       'text-emerald-400',
      bgColor:     'bg-emerald-400/10',
    },
    {
      key:         'profile',
      enabled:     true,
      label:       'My Profile',
      description: 'Manage your account and preferences',
      icon:        User,
      href:        '/portal/customers/profile',
      color:       'text-white/60',
      bgColor:     'bg-white/4',
    },
  ]

  const enabledSections = allSections.filter(s => s.enabled)

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">
          {customerCtx ? `Welcome back` : 'Customer Portal'}
        </h1>
        <p className="text-sm text-white/40">
          {customerCtx
            ? `Your account with ${tenant?.name ?? 'this business'}`
            : `Manage your account with ${tenant?.name ?? 'us'}`}
        </p>
      </div>

      {/* Sign-in prompt if not authenticated */}
      {!customerCtx && (
        <div className="rounded-xl bg-gold-500/8 border border-gold-500/20 px-5 py-4 flex items-center justify-between gap-4">
          <p className="text-sm text-gold-300">
            Sign in to access your personal portal.
          </p>
          <Link
            href="/login?next=/portal"
            className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-4 rounded-xl text-xs font-semibold bg-gold-gradient text-graphite-900"
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign in
          </Link>
        </div>
      )}

      {/* Portal sections */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {enabledSections.map((section) => {
          const Icon = section.icon
          return (
            <Link key={section.key} href={section.href} className="block focus-ring rounded-2xl">
              <Card className="group hover:shadow-panel-lg transition-shadow duration-200 !p-5 cursor-pointer">
                <div className="flex items-start gap-4">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${section.bgColor} border border-white/10`}>
                    <Icon className={`h-5 w-5 ${section.color}`} strokeWidth={1.75} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white mb-0.5">{section.label}</p>
                    <p className="text-xs text-white/40">{section.description}</p>
                  </div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
