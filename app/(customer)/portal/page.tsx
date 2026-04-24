import { headers } from 'next/headers'
import { getTenantFromHost } from '@/lib/tenant/getTenantFromHost'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card'
import { CalendarDays, CreditCard, Star, Car } from 'lucide-react'
import Link from 'next/link'

// TODO: Gate this behind customer authentication
// Customer should only see their own appointments, rewards, payments, and vehicles

export default async function CustomerPortalPage() {
  const host   = (await headers()).get('host') ?? ''
  const tenant = await getTenantFromHost(host)

  const portalSections = [
    {
      label:       'Appointments',
      description: 'View and manage your upcoming bookings',
      icon:        CalendarDays,
      href:        '/portal/appointments',
      color:       'text-blue-400',
      bgColor:     'bg-blue-400/10',
    },
    {
      label:       'Rewards',
      description: 'Check your loyalty points and history',
      icon:        Star,
      href:        '/portal/rewards',
      color:       'text-yellow-400',
      bgColor:     'bg-yellow-400/10',
    },
    {
      label:       'Payments',
      description: 'View invoices and payment history',
      icon:        CreditCard,
      href:        '/portal/payments',
      color:       'text-emerald-400',
      bgColor:     'bg-emerald-400/10',
    },
    {
      label:       'My Vehicles',
      description: 'View your rental history and active agreements',
      icon:        Car,
      href:        '/portal/vehicles',
      color:       'text-gold-400',
      bgColor:     'bg-gold-400/10',
    },
  ]

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">
          Welcome back
        </h1>
        <p className="text-sm text-white/40">
          Manage your account with {tenant?.name ?? 'us'}
        </p>
      </div>

      {/* Auth notice */}
      <div className="rounded-xl bg-gold-500/8 border border-gold-500/20 px-5 py-4">
        <p className="text-sm text-gold-300">
          <span className="font-semibold">Customer authentication coming soon.</span>{' '}
          This portal will be secured with customer login before going live.
        </p>
      </div>

      {/* Portal sections */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {portalSections.map((section) => {
          const Icon = section.icon
          return (
            <Link key={section.href} href={section.href} className="block focus-ring rounded-2xl">
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
