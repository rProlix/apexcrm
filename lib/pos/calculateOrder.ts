// lib/pos/calculateOrder.ts
// Pure order calculation engine. All amounts in cents (integers).
// No floating point money errors — uses Math.round throughout.

import type { CartItem, CartModifierSelection, OrderCalculation, POSSettings } from './types'

interface DiscountInput {
  type:  'percent' | 'fixed_amount'
  value: number  // percent (0-100) or cents
}

interface CalculateOrderInput {
  items:          CartItem[]
  discount?:      DiscountInput | null
  tip_cents?:     number
  settings:       Pick<POSSettings, 'default_tax_rate' | 'service_fee_enabled' | 'service_fee_percent' | 'tips_enabled'>
  amount_paid_cents?: number
}

/**
 * Calculates modifier total for a single cart item.
 * modifier price_delta * modifier quantity
 */
export function calcModifierTotal(modifiers: CartModifierSelection[]): number {
  return modifiers.reduce((sum, m) => sum + Math.round(m.price_delta_cents * m.quantity), 0)
}

/**
 * Calculates a single item's total (no tax yet).
 */
export function calcItemSubtotal(item: CartItem): number {
  const modTotal   = calcModifierTotal(item.modifiers)
  const unitWithMod = item.unit_price_cents + modTotal
  return Math.round(unitWithMod * item.quantity)
}

/**
 * Apply a discount to a subtotal amount.
 * Returns discount in cents (never negative, never more than subtotal).
 */
export function applyDiscount(subtotal: number, discount: DiscountInput | null | undefined): number {
  if (!discount) return 0
  let d = 0
  if (discount.type === 'percent') {
    d = Math.round((subtotal * discount.value) / 100)
  } else {
    d = Math.round(discount.value)
  }
  return Math.max(0, Math.min(d, subtotal))
}

/**
 * Full order calculation.
 * Returns all monetary values in cents.
 */
export function calculateOrder(input: CalculateOrderInput): OrderCalculation {
  const { items, discount, tip_cents = 0, settings, amount_paid_cents = 0 } = input

  const taxRate = (settings.default_tax_rate ?? 0) / 100

  // Per-item calculation
  const itemCalcs = items.map((item) => {
    const modifierTotal   = calcModifierTotal(item.modifiers)
    const unitWithMods    = item.unit_price_cents + modifierTotal
    const subtotalCents   = Math.round(unitWithMods * item.quantity)
    const discountCents   = 0  // item-level discounts handled separately
    const effectiveTaxRate = item.taxable
      ? (item.tax_rate !== null && item.tax_rate !== undefined ? item.tax_rate / 100 : taxRate)
      : 0
    const taxableBasis  = subtotalCents - discountCents
    const taxCents      = Math.round(taxableBasis * effectiveTaxRate)
    const totalCents    = subtotalCents - discountCents + taxCents

    return {
      cart_key:              item.cart_key,
      base_price_cents:      item.unit_price_cents,
      modifier_total_cents:  modifierTotal,
      unit_price_with_mods:  unitWithMods,
      subtotal_cents:        subtotalCents,
      discount_cents:        discountCents,
      tax_cents:             taxCents,
      total_cents:           totalCents,
    }
  })

  const subtotalCents  = itemCalcs.reduce((s, i) => s + i.subtotal_cents, 0)
  const itemTaxCents   = itemCalcs.reduce((s, i) => s + i.tax_cents, 0)

  // Order-level discount applied to subtotal
  const discountCents  = applyDiscount(subtotalCents, discount ?? null)
  const taxedSubtotal  = subtotalCents - discountCents

  // If tax is on items, we already computed it. Recompute on discounted subtotal.
  // This handles order-level discount reducing tax base.
  const taxCents = items.every((i) => i.taxable)
    ? Math.round(taxedSubtotal * taxRate)
    : itemTaxCents  // mixed taxable items — keep per-item tax

  const serviceFee = settings.service_fee_enabled
    ? Math.round(taxedSubtotal * (settings.service_fee_percent / 100))
    : 0

  const safeTip = settings.tips_enabled ? Math.max(0, Math.round(tip_cents)) : 0

  const totalCents       = Math.max(0, taxedSubtotal + taxCents + serviceFee + safeTip)
  const balanceDueCents  = Math.max(0, totalCents - Math.max(0, amount_paid_cents))

  return {
    items:              itemCalcs,
    subtotal_cents:     subtotalCents,
    discount_cents:     discountCents,
    tax_cents:          taxCents,
    tip_cents:          safeTip,
    service_fee_cents:  serviceFee,
    total_cents:        totalCents,
    amount_paid_cents:  Math.max(0, amount_paid_cents),
    balance_due_cents:  balanceDueCents,
  }
}

/** Format cents as currency string */
export function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

/** Safe cents addition (avoids floating point issues) */
export function addCents(...amounts: number[]): number {
  return amounts.reduce((s, a) => s + Math.round(a), 0)
}
