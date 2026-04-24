// lib/payments/chargeCustomer.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getDefaultProvider } from './getDefaultProvider'
import { getAdapter } from './adapters/getAdapter'
import { syncProviderEvent } from './syncProviderEvent'
import { getPaymentSettings } from './getPaymentSettings'

export interface ChargeCustomerParams {
  tenantId:     string
  customerId?:  string
  invoiceId?:   string
  amount:       number          // major currency unit (e.g. 10.00 for $10)
  currency?:    string
  description?: string
  source?:      string          // provider payment method token
  providerKey?: string
  metadata?:    Record<string, string>
}

export interface ChargeCustomerResult {
  transactionId:         string
  providerTransactionId: string
  status:                string
  amount:                number
  currency:              string
}

/**
 * Charges a customer via the tenant's configured payment provider.
 * Routes to Stripe or Square based on tenant settings.
 * Persists the transaction and links it to the invoice.
 */
export async function chargeCustomer(
  params: ChargeCustomerParams
): Promise<ChargeCustomerResult> {
  if (params.amount <= 0) {
    throw new Error('[chargeCustomer] Amount must be greater than 0')
  }

  const settings  = await getPaymentSettings(params.tenantId)
  const currency  = params.currency ?? settings.currency

  const providerInfo = await getDefaultProvider(params.tenantId, params.providerKey)
  if (!providerInfo) {
    throw new Error('[chargeCustomer] No payment provider configured for this tenant')
  }

  const adapter = getAdapter(providerInfo.providerKey)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  // Validate invoice belongs to tenant before charging
  if (params.invoiceId) {
    const { data: inv } = await supabase
      .from('invoices')
      .select('id, amount, status, tenant_id')
      .eq('id', params.invoiceId)
      .eq('tenant_id', params.tenantId)
      .maybeSingle()

    if (!inv) {
      throw new Error('[chargeCustomer] Invoice not found or does not belong to this tenant')
    }
    if (inv.status === 'paid') {
      throw new Error('[chargeCustomer] Invoice is already paid')
    }
    if (inv.status === 'canceled') {
      throw new Error('[chargeCustomer] Invoice is canceled')
    }
  }

  const chargeResult = await adapter.createCharge(
    {
      amount:      params.amount,
      currency,
      tenantId:    params.tenantId,
      customerId:  params.customerId,
      invoiceId:   params.invoiceId,
      description: params.description,
      source:      params.source,
      metadata:    params.metadata,
    },
    providerInfo.config
  )

  // Persist transaction
  const { data: tx, error: txErr } = await supabase
    .from('payment_transactions')
    .insert({
      tenant_id:              params.tenantId,
      invoice_id:             params.invoiceId  ?? null,
      customer_id:            params.customerId ?? null,
      provider_key:           providerInfo.providerKey,
      provider_transaction_id: chargeResult.providerTransactionId,
      provider_payment_id:    chargeResult.providerPaymentId ?? null,
      amount:                 chargeResult.amount,
      currency:               chargeResult.currency,
      status:                 chargeResult.status,
      transaction_type:       'charge',
    })
    .select('id')
    .single()

  if (txErr || !tx) {
    throw new Error(`[chargeCustomer] Transaction insert failed: ${txErr?.message}`)
  }

  // Update invoice status if charge succeeded
  if (chargeResult.status === 'succeeded' && params.invoiceId) {
    await supabase
      .from('invoices')
      .update({ status: 'paid', provider_reference: chargeResult.providerTransactionId })
      .eq('id', params.invoiceId)
      .eq('tenant_id', params.tenantId)
  }

  await syncProviderEvent({
    tenantId:   params.tenantId,
    providerKey: providerInfo.providerKey,
    eventType:   `charge.${chargeResult.status}`,
    payload: {
      transaction_id:         tx.id,
      provider_transaction_id: chargeResult.providerTransactionId,
      amount:                  chargeResult.amount,
      currency:                chargeResult.currency,
      customer_id:             params.customerId,
      invoice_id:              params.invoiceId,
    },
    idempotencyKey: chargeResult.providerTransactionId,
  })

  return {
    transactionId:         tx.id,
    providerTransactionId: chargeResult.providerTransactionId,
    status:                chargeResult.status,
    amount:                chargeResult.amount,
    currency:              chargeResult.currency,
  }
}
