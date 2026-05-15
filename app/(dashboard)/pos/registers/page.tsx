export const dynamic = 'force-dynamic'

// app/(dashboard)/pos/registers/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getPOSClient } from '@/lib/pos/supabasePOS'
import { POSRegisters } from '@/components/pos/POSRegisters'

export const metadata = { title: 'Registers & Shifts — POS' }

export default async function POSRegistersPage() {
  const ctx = await requireRole(['owner', 'admin', 'manager', 'staff'])

  if (ctx.tenant_id) {
    await guardModuleAccess(ctx.tenant_id, 'pos', ctx.role)
  }

  const supabase = getPOSClient()
  const tenantId = ctx.tenant_id ?? ''

  const [{ data: registers }, { data: shifts }] = await Promise.all([
    supabase.from('pos_registers').select('*').eq('tenant_id', tenantId).neq('status', 'archived').order('name'),
    supabase.from('pos_shifts').select('*, pos_registers(name)').eq('tenant_id', tenantId).order('opened_at', { ascending: false }).limit(20),
  ])

  return (
    <POSRegisters
      tenantId={tenantId}
      userRole={ctx.role}
      userId={ctx.id}
      initialRegisters={registers ?? []}
      initialShifts={shifts ?? []}
    />
  )
}
