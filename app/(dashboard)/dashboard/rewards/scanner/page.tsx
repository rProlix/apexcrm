import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { RewardsScannerClient } from '@/components/rewards/RewardsScannerClient'

export default async function RewardsScannerPage() {
  const ctx = await requireRole(['owner', 'admin', 'manager', 'staff'])
  if (ctx.tenant_id) await guardModuleAccess(ctx.tenant_id, 'rewards', ctx.role)
  return <RewardsScannerClient />
}
