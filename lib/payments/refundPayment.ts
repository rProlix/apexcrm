// lib/payments/refundPayment.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getDefaultProvider } from './getDefaultProvider'
import { getAdapter } from './adapters/getAdapter'
import { syncProviderEvent } from './syncProviderEvent'
import { getPaymentSettings } from './getPaymentSettings'

export interface RefundPaymentParams {
  tenantId:      string
  transactionId: string   // payment_transactions.id (internal)
  amount?:       number   // if not provided, full refund
  reason?:       string
  metadata?:     Record<string, string>
}

export interface RefundResult {
  refundId:        string
  providerRefundId: string
  status:          string
  amount:          number
}

/**
 * Issues a refund for a payment transaction.
 * Validates:
 *  - Transaction belongs to the tenant
 *  - Transaction has succeeded (can only refund succeeded charges)
 *  - Refund amount does not exceed original charge
 *  - Settings allow partial refunds if amount < full charge
 */
export async function refundPayment(params: RefundPaymentParams): Promise<RefundResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  // Fetch transaction — must belong to this tenant
  const { data: tx } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('id', params.transactionId)
    .eq('tenant_id', params.tenantId)
    .maybeSingle()

  if (!tx) {
    throw new Error('[refundPayment] Transaction not found or does not belong to this tenant')
  }

  if (tx.status !== 'succeeded') {
    throw new Error(`[refundPayment] Cannot refund a transaction with status: ${tx.status}`)
  }

  if (tx.transaction_type !== 'charge') {
    throw new Error('[refundPayment] Can only refund charge transactions')
  }

  // Determine refund amount
  const fullAmount   = Number(tx.amount)
  const refundAmount = params.amount ?? fullAmount

  if (refundAmount <= 0) {
    throw new Error('[refundPayment] Refund amount must be greater than 0')
  }

  if (refundAmount > fullAmount) {
    throw new Error(`[refundPayment] Refund amount (${refundAmount}) exceeds original charge (${fullAmount})`)
  }

  const settings = await getPaymentSettings(params.tenantId)

  if (!settings.allow_partial_payments && refundAmount < fullAmount) {
    throw new Error('[refundPayment] Partial refunds are not enabled for this tenant')
  }

  // Sum existing refunds to prevent over-refunding
  const { data: existingRefunds } = await supabase
    .from('payment_refunds')
    .select('amount')
    .eq('payment_transaction_id', params.transactionId)
    .in('status', ['pending', 'succeeded'])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alreadyRefunded = (existingRefunds ?? [] as any[]).reduce(
    (sum: number, r: any) => sum + Number(r.amount),
    0
  )

  if (alreadyRefunded + refundAmount > fullAmount) {
    throw new Error(
      `[refundPayment] Total refunds (${alreadyRefunded + refundAmount}) would exceed original charge (${fullAmount})`
    )
  }

  const providerInfo = await getDefaultProvider(params.tenantId, tx.provider_key)
  if (!providerInfo) {
    throw new Error('[refundPayment] No provider config found for this transaction')
  }

  const adapter = getAdapter(tx.provider_key)

  const refundResult = await adapter.refundPayment(
    {
      providerTransactionId: tx.provider_transaction_id,
      amount:                refundAmount,
      currency:              tx.currency,
      tenantId:              params.tenantId,
      reason:                params.reason,
      metadata:              params.metadata,
    },
    providerInfo.config
  )

  // Persist refund
  const { data: refund, error: refundErr } = await supabase
    .from('payment_refunds')
    .insert({
      tenant_id:              params.tenantId,
      payment_transaction_id: params.transactionId,
      provider_key:           tx.provider_key,
      provider_refund_id:     refundResult.providerRefundId,
      amount:                 refundResult.amount,
      status:                 refundResult.status,
    })
    .select('id')
    .single()

  if (refundErr || !refund) {
    throw new Error(`[refundPayment] Refund DB insert failed: ${refundErr?.message}`)
  }

  // Update transaction status
  const newTxStatus = alreadyRefunded + refundResult.amount >= fullAmount
    ? 'refunded'
    : 'succeeded'  // partial refund — original still succeeded

  await supabase
    .from('payment_transactions')
    .update({ status: newTxStatus })
    .eq('id', params.transactionId)
    .eq('tenant_id', params.tenantId)

  // Update invoice status if fully refunded
  if (newTxStatus === 'refunded' && tx.invoice_id) {
    await supabase
      .from('invoices')
      .update({ status: 'refunded' })
      .eq('id', tx.invoice_id)
      .eq('tenant_id', params.tenantId)
  }

  await syncProviderEvent({
    tenantId:    params.tenantId,
    providerKey: tx.provider_key,
    eventType:   `refund.${refundResult.status}`,
    payload: {
      refund_id:              refund.id,
      provider_refund_id:     refundResult.providerRefundId,
      transaction_id:         params.transactionId,
      amount:                 refundResult.amount,
    },
    idempotencyKey: refundResult.providerRefundId,
  })

  return {
    refundId:         refund.id,
    providerRefundId: refundResult.providerRefundId,
    status:           refundResult.status,
    amount:           refundResult.amount,
  }
}
