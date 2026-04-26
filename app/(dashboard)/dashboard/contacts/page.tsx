export const dynamic = 'force-dynamic'

import { BookUser, Users, UserCheck } from 'lucide-react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Contacts — ApexCRM' }

interface ContactCounts {
  contacts:  number
  customers: number
}

async function getContactCounts(tenantId: string): Promise<ContactCounts> {
  try {
    const db = getSupabaseServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyDb = db as any
    const [{ count: contacts }, { count: customers }] = await Promise.all([
      anyDb.from('contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      anyDb.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    ])
    return { contacts: contacts ?? 0, customers: customers ?? 0 }
  } catch {
    return { contacts: 0, customers: 0 }
  }
}

export default async function ContactsPage() {
  const ctx = await requirePermission('use_modules')
  const tenantId = ctx.tenant_id!

  await guardModuleAccess(tenantId, 'contacts', ctx.role)

  const counts = await getContactCounts(tenantId)
  const total = counts.contacts + counts.customers

  const stats = [
    { label: 'Contacts',  value: counts.contacts,  icon: BookUser,   color: 'text-teal-400', bg: 'bg-teal-400/10' },
    { label: 'Customers', value: counts.customers, icon: UserCheck,  color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
    { label: 'Total',     value: total,            icon: Users,      color: 'text-sky-400',  bg: 'bg-sky-400/10'  },
  ]

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Contacts</h1>
        <p className="text-sm text-white/40 mt-1">Central address book for all contacts</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-xl bg-graphite-800 border border-graphite-600 p-4">
            <div className={`inline-flex items-center justify-center h-9 w-9 rounded-lg ${bg} mb-3`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-white/40 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-graphite-800 border border-graphite-600 p-8 text-center">
        <BookUser className="h-10 w-10 text-teal-400/60 mx-auto mb-3" />
        <p className="text-white/60 text-sm">
          {total === 0
            ? 'No contacts yet. They will appear here once added.'
            : `${total} contact${total === 1 ? '' : 's'} — full contacts management UI coming soon.`}
        </p>
      </div>
    </div>
  )
}
