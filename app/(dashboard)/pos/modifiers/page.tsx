export const dynamic = 'force-dynamic'

// app/(dashboard)/pos/modifiers/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getPOSClient } from '@/lib/pos/supabasePOS'
import { POSModifiersClient } from '@/components/pos/POSModifiersClient'

export const metadata = { title: 'Modifiers — POS' }

export default async function POSModifiersPage() {
  const ctx = await requireRole(['owner', 'admin', 'manager'])

  if (ctx.tenant_id) {
    await guardModuleAccess(ctx.tenant_id, 'pos', ctx.role)
  }

  const supabase = getPOSClient()
  const tenantId = ctx.tenant_id ?? ''

  const [{ data: groups }, { data: products }] = await Promise.all([
    supabase.from('pos_modifier_groups').select(`*, pos_modifiers(*)`).eq('tenant_id', tenantId).neq('status', 'archived').order('sort_order'),
    supabase.from('products').select('id,name').eq('tenant_id', tenantId).eq('is_active', true).order('name').limit(200),
  ])

  return (
    <POSModifiersClient
      tenantId={tenantId}
      initialGroups={groups ?? []}
      products={products ?? []}
    />
  )
}
