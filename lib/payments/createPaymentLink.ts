// lib/payments/createPaymentLink.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getDefaultProvider } from './getDefaultProvider'
import { getAdapter } from './adapters/getAdapter'
import { getPaymentSettings } from './getPaymentSettings'
import { syncProviderEvent } from './syncProviderEvent'

export interface CreatePaymentLinkParams {
  tenantId:    string
  invoiceId?:  string
  title:       string
  amount:      number
  currency?:   string
  providerKey?: string
  successUrl?: string
  cancelUrl?:  string
  metadata?:   Record<string, string>
}

export interface CreatedPaymentLink {
  id:              string
  url:             string
  providerLinkId:  string
  providerKey:     string
}

/**
 * Creates a payment link via the tenant's configured provider (Stripe or Square).
 * Persists the link in payment_links and logs a payment_event.
 */
export async function createPaymentLink(
  params: CreatePaymentLinkParams
): Promise<CreatedPaymentLink> {
  const settings = await getPaymentSettings(params.tenantId)
  const currency = params.currency ?? settings.currency

  const providerInfo = await getDefaultProvider(params.tenantId, params.providerKey)
  if (!providerInfo) {
    throw new Error('[createPaymentLink] No payment provider configured for this tenant')
  }

  const adapter = getAdapter(providerInfo.providerKey)

  const linkResult = await adapter.createPaymentLink(
    {
      title:      params.title,
      amount:     params.amount,
      currency,
      tenantId:   params.tenantId,
      invoiceId:  params.invoiceId,
      successUrl: params.successUrl,
      cancelUrl:  params.cancelUrl,
      metadata:   params.metadata,
    },
    providerInfo.config
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const { data: link, error } = await supabase
    .from('payment_links')
    .insert({
      tenant_id:       params.tenantId,
      invoice_id:      params.invoiceId   ?? null,
      title:           params.title,
      amount:          params.amount,
      currency,
      provider_key:    providerInfo.providerKey,
      provider_link_id: linkResult.providerLinkId,
      url:             linkResult.url,
      status:          'active',
    })
    .select('id')
    .single()

  if (error || !link) {
    throw new Error(`[createPaymentLink] DB insert failed: ${error?.message}`)
  }

  await syncProviderEvent({
    tenantId:   params.tenantId,
    providerKey: providerInfo.providerKey,
    eventType:   'payment_link.created',
    payload: {
      payment_link_id:  link.id,
      provider_link_id: linkResult.providerLinkId,
      url:              linkResult.url,
      amount:           params.amount,
      currency,
    },
  })

  return {
    id:             link.id,
    url:            linkResult.url,
    providerLinkId: linkResult.providerLinkId,
    providerKey:    providerInfo.providerKey,
  }
}
