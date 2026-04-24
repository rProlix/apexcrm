import { BookUser } from 'lucide-react'
import type { ModuleDefinition } from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const contactsModule: ModuleDefinition = {
  key:         'contacts',
  label:       'Contacts',
  description: 'Central address book for all contacts',
  icon:        BookUser,
  href:        '/dashboard/contacts',
  color:       'text-teal-400',
  bgColor:     'bg-teal-400/10',
  order:       8,

  stats: [
    {
      key:      'contacts_total',
      label:    'Contacts',
      category: 'usage',
      color:    'text-teal-400',
      emptyMessage: 'No contacts yet',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
        return count ?? 0
      },
    },
    {
      key:      'customers_total',
      label:    'Customers',
      category: 'usage',
      color:    'text-cyan-400',
      emptyMessage: 'No customers yet',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
        return count ?? 0
      },
    },
  ],

  async getStats(tenantId) {
    const supabase = getSupabaseServerClient()
    const { count } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)

    const { count: customerCount } = await supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)

    return [
      { label: 'Contacts',  value: count ?? 0 },
      { label: 'Customers', value: customerCount ?? 0 },
    ]
  },
}
