export const dynamic = 'force-dynamic'

// app/(dashboard)/rewards/shop/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getAllProductRewardsConfigs } from '@/lib/rewards/getProductRewardsConfig'
import { RewardsShopItemForm } from '@/components/rewards/RewardsShopItemForm'
import { RewardsShopGrid } from '@/components/rewards/RewardsShopGrid'
import type { RewardShopItem } from '@/types/rewards'

export const metadata = { title: 'Rewards Shop' }

export default async function RewardsShopAdminPage() {
  const ctx = await requireRole(['owner', 'admin'])
  if (ctx.tenant_id) await guardModuleAccess(ctx.tenant_id, 'rewards', ctx.role)

  const tenantId = ctx.tenant_id ?? ''
  const supabase = getSupabaseServerClient()

  const [itemsRes, products] = await Promise.all([
    supabase
      .from('reward_shop_items')
      .select('*, products(name, price)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
    getAllProductRewardsConfigs(tenantId),
  ])

  const items = (itemsRes.data ?? []) as unknown as RewardShopItem[]

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Rewards Shop</h1>
          <p className="text-sm text-white/40 mt-1">Create and manage items customers can redeem with points.</p>
        </div>
      </div>

      <RewardsShopItemForm tenantId={tenantId} products={products} />

      <div>
        <h2 className="text-base font-semibold text-white mb-4">Shop Items ({items.length})</h2>
        <RewardsShopGrid items={items} isAdmin />
      </div>
    </div>
  )
}
