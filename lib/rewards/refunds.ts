import 'server-only'

import { getSupabaseServerClient } from '@/lib/supabase/server'

export async function reverseOrderRewards(input: {
  tenantId: string
  orderId: string
  refundId: string
  refundFraction?: number
}) {
  const db = getSupabaseServerClient() as any
  const { data: earned } = await db
    .from('rewards_transactions')
    .select('*')
    .eq('tenant_id', input.tenantId)
    .eq('source_id', input.orderId)
    .in('transaction_type', ['earned', 'bonus', 'promotion'])
  let reversed = 0
  for (const transaction of earned ?? []) {
    const requestedPoints = Math.max(
      1,
      Math.floor(
        Number(transaction.points_delta) * Math.min(1, Math.max(0, input.refundFraction ?? 1))
      )
    )
    const { data: currentBalance } = await db
      .from('rewards_balances')
      .select('points_balance')
      .eq('tenant_id', input.tenantId)
      .eq('customer_id', transaction.customer_id)
      .maybeSingle()
    const points = Math.min(
      requestedPoints,
      Math.max(0, Number(currentBalance?.points_balance ?? 0))
    )
    if (points === 0) continue
    const { data, error } = await db.rpc('apply_reward_points', {
      p_tenant_id: input.tenantId,
      p_customer_id: transaction.customer_id,
      p_program_id: transaction.program_id,
      p_transaction_type: 'refund_reversal',
      p_points_delta: -points,
      p_source_type: 'refund',
      p_source_id: input.refundId,
      p_idempotency_key: `refund:${input.refundId}:transaction:${transaction.id}`,
      p_description: 'Refund reward reversal',
      p_metadata: {
        order_id: input.orderId,
        requested_points: requestedPoints,
        uncollectible_points: requestedPoints - points,
      },
      p_reversed_transaction_id: transaction.id,
    })
    if (error) throw new Error(`Reward reversal failed: ${error.code}`)
    if (data?.[0]?.was_applied) reversed += points
  }
  return { reversed }
}
