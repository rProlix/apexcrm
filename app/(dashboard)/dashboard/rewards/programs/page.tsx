// app/(dashboard)/rewards/programs/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getAllProductRewardsConfigs } from '@/lib/rewards/getProductRewardsConfig'
import { RewardsProgramForm } from '@/components/rewards/RewardsProgramForm'
import type { RewardsProgram } from '@/types/rewards'

export const metadata = { title: 'Rewards Programs' }

export default async function RewardsProgramsPage() {
  const ctx = await requireRole(['owner', 'admin'])
  if (ctx.tenant_id) await guardModuleAccess(ctx.tenant_id, 'rewards', ctx.role)

  const tenantId = ctx.tenant_id ?? ''
  const supabase = getSupabaseServerClient()

  const [programsRes, products] = await Promise.all([
    supabase
      .from('rewards_programs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
    getAllProductRewardsConfigs(tenantId),
  ])

  const programs = (programsRes.data ?? []) as unknown as RewardsProgram[]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Rewards Programs</h1>
        <p className="text-sm text-white/40 mt-1">Configure earning rules, points, and program settings.</p>
      </div>
      <RewardsProgramForm
        tenantId={tenantId}
        programs={programs}
        products={products}
      />
    </div>
  )
}
