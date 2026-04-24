// app/(customer)/portal/customers/page.tsx
import { headers } from 'next/headers'
import { requireCustomerAuth } from '@/lib/auth/customerGuard'
import { getTenantCustomerById } from '@/lib/customers/getTenantCustomerById'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { User, ShoppingBag, CreditCard, FileText, Settings } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function CustomerPortalHomePage() {
  const host = headers().get('host') ?? ''
  const ctx  = await requireCustomerAuth(host)

  const customer = await getTenantCustomerById(ctx.tenant_id, ctx.customer_id)
  if (!customer) redirect('/login')

  const initials = customer.name
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  const links = [
    { icon: ShoppingBag, label: 'My Orders',   href: '/portal/customers/orders',   desc: 'View your order history',    color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { icon: CreditCard,  label: 'Payments',     href: '/portal/customers/payments', desc: 'View invoices & transactions', color: 'text-cyan-400',  bg: 'bg-cyan-400/10'  },
    { icon: Settings,    label: 'My Profile',   href: '/portal/customers/profile',  desc: 'Update your preferences',    color: 'text-gold-400',  bg: 'bg-gold-400/10'  },
  ]

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="premium-panel premium-border rounded-2xl p-6 flex items-center gap-5">
        <div className="h-16 w-16 rounded-2xl bg-gold-gradient flex items-center justify-center shadow-glow-gold flex-shrink-0">
          <span className="text-graphite-900 font-bold text-xl">{initials}</span>
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">
            Welcome back, {customer.name.split(' ')[0]}
          </h1>
          <p className="text-sm text-white/40 mt-0.5">{customer.email}</p>
          <p className="text-xs text-white/25 mt-1">
            Customer since {new Date(customer.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid gap-3">
        {links.map(({ icon: Icon, label, href, desc, color, bg }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-4 p-4 premium-panel premium-border rounded-2xl hover:border-gold-500/30 hover:shadow-glow-gold transition-all duration-200"
          >
            <div className={`h-11 w-11 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white text-sm">{label}</p>
              <p className="text-xs text-white/40 mt-0.5">{desc}</p>
            </div>
            <span className="text-white/20 group-hover:text-gold-400 transition-colors text-lg">→</span>
          </Link>
        ))}
      </div>

      <p className="text-xs text-white/20 text-center">
        Your data is private to this business and is never shared with other companies.
      </p>
    </div>
  )
}
