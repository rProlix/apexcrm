import assert from 'node:assert/strict'
import test from 'node:test'
import { applyPointModifiers, calculateRulePoints, selectQualifiedTier } from '../calculations'

const baseEvent = {
  tenantId: 'tenant-a',
  customerId: 'customer-a',
  sourceId: 'order-a',
  eventType: 'order_completed' as const,
  amount: 25,
  items: [
    { product_id: 'coffee', quantity: 2, price: 5 },
    { product_id: 'mug', quantity: 1, price: 15 },
  ],
}

test('spend rule awards threshold points and honors caps', () => {
  assert.equal(
    calculateRulePoints(
      { earning_basis: 'spend', amount_threshold: 5, points_awarded: 100, maximum_per_event: 450 },
      baseEvent
    ),
    450
  )
})

test('product rule awards only qualifying quantities', () => {
  assert.equal(
    calculateRulePoints(
      { earning_basis: 'product', points_awarded: 50, eligible_product_ids: ['coffee'] },
      baseEvent
    ),
    100
  )
})

test('minimum spend prevents nonqualifying awards', () => {
  assert.equal(
    calculateRulePoints(
      { earning_basis: 'fixed', points_awarded: 500, minimum_spend: 30 },
      baseEvent
    ),
    0
  )
})

test('tier and promotion multipliers compose before bonus points', () => {
  assert.equal(
    applyPointModifiers(100, 1.5, [
      { rule_type: 'multiplier', multiplier: 2 },
      { rule_type: 'bonus_points', bonus_points: 25 },
    ]),
    325
  )
})

test('highest qualifying tier wins', () => {
  const tier = selectQualifiedTier(
    [
      { name: 'Bronze', qualification_type: 'points', threshold: 0 },
      { name: 'Gold', qualification_type: 'points', threshold: 1000 },
      { name: 'Silver', qualification_type: 'points', threshold: 500 },
    ],
    820
  )
  assert.equal(tier?.name, 'Silver')
})
