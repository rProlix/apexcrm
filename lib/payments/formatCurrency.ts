// lib/payments/formatCurrency.ts

/**
 * Format a numeric amount as a currency string.
 * Respects the tenant's configured currency code.
 */
export function formatCurrency(
  amount:   number,
  currency: string = 'USD',
  locale:   string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style:                 'currency',
    currency:              currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Format a number as a plain decimal string with 2 decimal places.
 */
export function formatAmount(amount: number): string {
  return Number(amount).toFixed(2)
}

/**
 * Convert cents (integer) to major currency unit (float).
 */
export function centsToAmount(cents: number): number {
  return cents / 100
}

/**
 * Convert major currency unit to cents (integer).
 */
export function amountToCents(amount: number): number {
  return Math.round(amount * 100)
}
