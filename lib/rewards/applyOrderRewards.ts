// lib/rewards/applyOrderRewards.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { OrderItemForRewards, ApplyOrderRewardsResult } from '@/types/rewards'
import { calculatePoints } from './calculatePoints'
import { getRewardsProgram, getProgramSettings } from './getRewardsProgram'

/**
 * Called after a successful order is placed.
 *
 * This function:
 *  1. Calculates points earned from the order
 *  2. Upserts the customer's rewards balance
 *  3. Creates a rewards transaction record
 *  4. Finds matching punch card rules and increments progress
 *  5. Creates punch card event records
 *
 * All database writes are wrapped in a logical sequence.
 * Punch card updates use the increment_punch_card RPC for atomicity.
 *
 * Returns a summary of what was applied. Errors are logged but do not
 * throw — rewards should never block order completion.
 */
export async function applyOrderRewards(params: {
  tenantId:   string
  customerId: string
  orderId:    string
  items:      OrderItemForRewards[]
}): Promise<ApplyOrderRewardsResult> {
  const { tenantId, customerId, orderId, items } = params
  const supabase = getSupabaseServerClient() as any

  const EMPTY: ApplyOrderRewardsResult = {
    points_earned:   0,
    new_balance:     0,
    punch_cards_hit: [],
    transaction_id:  '',
  }

  try {
    // Load program and settings
    const program  = await getRewardsProgram(tenantId)
    const settings = await getProgramSettings(tenantId)

    const programId = program?.id ?? null

    // ── Step 1: Calculate points ───────────────────────────────────────────
    let pointsEarned = 0
    if (settings.points_enabled) {
      const result = await calculatePoints(tenantId, programId, items)
      pointsEarned = result.total_points
    }

    // ── Step 2: Upsert rewards balance ─────────────────────────────────────
    let newBalance = 0
    if (pointsEarned > 0) {
      const { data: balanceData, error: balanceError } = await supabase
        .rpc('upsert_rewards_balance', {
          p_tenant_id:   tenantId,
          p_customer_id: customerId,
          p_points_delta: pointsEarned,
        })

      if (balanceError) {
        console.error('[applyOrderRewards] balance upsert', balanceError.message)
      } else {
        newBalance = (balanceData as unknown as number) ?? 0
      }
    } else {
      // Still fetch current balance for return value
      const { data: balRow } = await supabase
        .from('rewards_balances')
        .select('points_balance')
        .eq('tenant_id', tenantId)
        .eq('customer_id', customerId)
        .maybeSingle()
      newBalance = balRow?.points_balance ?? 0
    }

    // ── Step 3: Create transaction record ─────────────────────────────────
    let transactionId = ''
    if (pointsEarned > 0) {
      const { data: txn, error: txnError } = await supabase
        .from('rewards_transactions')
        .insert({
          tenant_id:        tenantId,
          customer_id:      customerId,
          program_id:       programId,
          transaction_type: 'earned',
          points_delta:     pointsEarned,
          source_type:      'order',
          source_id:        orderId,
          metadata:         { order_id: orderId, items_count: items.length },
        })
        .select('id')
        .single()

      if (txnError) {
        console.error('[applyOrderRewards] transaction insert', txnError.message)
      } else {
        transactionId = txn.id
      }
    }

    // ── Step 4: Process punch cards ────────────────────────────────────────
    const punchCardsHit: string[] = []

    if (settings.punch_cards_enabled && program?.punch_card_rules?.length) {
      const productIds = items.map((i) => i.product_id)

      for (const rule of program.punch_card_rules) {
        if (!rule.enabled) continue
        if (rule.product_id && !productIds.includes(rule.product_id)) continue

        const matchingItems = rule.product_id
          ? items.filter((i) => i.product_id === rule.product_id)
          : items

        const punchesToAdd = matchingItems.reduce((sum, i) => sum + i.quantity, 0)
        if (punchesToAdd <= 0) continue

        // Find existing active punch card for this customer + rule
        const { data: existingCard } = await supabase
          .from('reward_punch_cards')
          .select('id, current_punches, punch_goal, status')
          .eq('tenant_id', tenantId)
          .eq('customer_id', customerId)
          .eq('product_id', rule.product_id ?? null)
          .eq('title', rule.name)
          .eq('status', 'active')
          .maybeSingle()

        let cardId: string

        if (existingCard) {
          cardId = existingCard.id
        } else {
          // Create new punch card for this customer
          const { data: newCard, error: cardError } = await supabase
            .from('reward_punch_cards')
            .insert({
              tenant_id:   tenantId,
              customer_id: customerId,
              product_id:  rule.product_id ?? null,
              title:       rule.name,
              punch_goal:  rule.punch_goal,
              reward_type: rule.reward_type,
              reward_value: rule.reward_value,
              status:      'active',
            })
            .select('id')
            .single()

          if (cardError || !newCard) {
            console.error('[applyOrderRewards] punch card create', cardError?.message)
            continue
          }
          cardId = newCard.id
        }

        // Atomically increment punches
        const { error: incrError } = await supabase
          .rpc('increment_punch_card', {
            p_punch_card_id: cardId,
            p_punches:       punchesToAdd,
          })

        if (incrError) {
          console.error('[applyOrderRewards] punch card increment', incrError.message)
          continue
        }

        // Record the punch event
        await supabase.from('reward_punch_card_events').insert({
          tenant_id:     tenantId,
          punch_card_id: cardId,
          customer_id:   customerId,
          order_id:      orderId,
          product_id:    rule.product_id ?? null,
          punches_added: punchesToAdd,
          metadata:      { rule_name: rule.name, order_id: orderId },
        })

        punchCardsHit.push(rule.name)
      }
    }

    return {
      points_earned:   pointsEarned,
      new_balance:     newBalance,
      punch_cards_hit: punchCardsHit,
      transaction_id:  transactionId,
    }
  } catch (err) {
    console.error('[applyOrderRewards] unexpected error', err)
    return EMPTY
  }
}
