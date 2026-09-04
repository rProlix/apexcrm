import type { ApplyOrderRewardsResult, OrderItemForRewards } from '@/types/rewards'
import { processRewardEvent } from './engine'

export async function applyOrderRewards(params: {
  tenantId: string
  customerId: string
  orderId: string
  items: OrderItemForRewards[]
}): Promise<ApplyOrderRewardsResult> {
  return processRewardEvent({
    tenantId: params.tenantId,
    customerId: params.customerId,
    sourceId: params.orderId,
    eventType: 'order_completed',
    amount: params.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    items: params.items,
  })
}
