// app/(dashboard)/rewards/settings/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getRewardsProgram } from '@/lib/rewards/getRewardsProgram'
import { getAllProductRewardsConfigs } from '@/lib/rewards/getProductRewardsConfig'
import { PointsRuleBuilder } from '@/components/rewards/PointsRuleBuilder'
import { ProductRewardsSelector } from '@/components/rewards/ProductRewardsSelector'

export const metadata = { title: 'Rewards Settings' }

export default async function RewardsSettingsPage() {
  const ctx = await requireRole(['owner', 'admin'])
  if (ctx.tenant_id) await guardModuleAccess(ctx.tenant_id, 'rewards', ctx.role)

  const tenantId = ctx.tenant_id ?? ''

  const [program, products] = await Promise.all([
    getRewardsProgram(tenantId),
    getAllProductRewardsConfigs(tenantId),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Rewards Settings</h1>
        <p className="text-sm text-white/40 mt-1">
          Configure how customers earn points and which products participate in rewards.
        </p>
      </div>

      <PointsRuleBuilder
        tenantId={tenantId}
        program={program}
        products={products}
      />

      <ProductRewardsSelector
        tenantId={tenantId}
        products={products}
      />
    </div>
  )
}
