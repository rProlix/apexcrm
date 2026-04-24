// lib/payments/adapters/stripeAdapter.ts
import Stripe from 'stripe'
import type {
  PaymentAdapter,
  AdapterConfig,
  PaymentLinkParams,
  PaymentLinkResult,
  ChargeParams,
  ChargeResult,
  InvoiceParams,
  InvoiceResult,
  RefundParams,
  RefundResult,
  CancelParams,
  WebhookEvent,
  PaymentStatusResult,
} from './paymentAdapter'

function getStripe(config: AdapterConfig): Stripe {
  if (!config.secretKey) throw new Error('[StripeAdapter] secretKey is required')
  // Use the latest Stripe API version available in the installed SDK
  return new Stripe(config.secretKey)
}

function toStripeAmount(amount: number): number {
  return Math.round(amount * 100)
}

function fromStripeAmount(amount: number): number {
  return amount / 100
}

function mapStripeStatus(status: string): 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded' {
  switch (status) {
    case 'succeeded':         return 'succeeded'
    case 'canceled':          return 'canceled'
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
    case 'processing':        return 'pending'
    default:                  return 'failed'
  }
}

export const stripeAdapter: PaymentAdapter = {
  providerKey: 'stripe',

  // ── createPaymentLink ──────────────────────────────────────────────────────
  async createPaymentLink(
    params: PaymentLinkParams,
    config: AdapterConfig
  ): Promise<PaymentLinkResult> {
    const stripe = getStripe(config)

    const session = await stripe.checkout.sessions.create({
      mode:          'payment',
      line_items: [
        {
          price_data: {
            currency:     params.currency.toLowerCase(),
            unit_amount:  toStripeAmount(params.amount),
            product_data: { name: params.title },
          },
          quantity: 1,
        },
      ],
      success_url: params.successUrl ?? `${process.env.NEXT_PUBLIC_APP_URL}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  params.cancelUrl  ?? `${process.env.NEXT_PUBLIC_APP_URL}/payments/cancel`,
      metadata: {
        tenant_id:  params.tenantId,
        invoice_id: params.invoiceId ?? '',
        ...params.metadata,
      },
    })

    return {
      providerLinkId: session.id,
      url:            session.url ?? '',
    }
  },

  // ── createCharge ──────────────────────────────────────────────────────────
  async createCharge(
    params: ChargeParams,
    config: AdapterConfig
  ): Promise<ChargeResult> {
    const stripe = getStripe(config)

    const intent = await stripe.paymentIntents.create({
      amount:      toStripeAmount(params.amount),
      currency:    params.currency.toLowerCase(),
      description: params.description,
      payment_method: params.source,
      confirm:     !!params.source,
      metadata: {
        tenant_id:   params.tenantId,
        customer_id: params.customerId ?? '',
        invoice_id:  params.invoiceId  ?? '',
        ...params.metadata,
      },
    })

    return {
      providerTransactionId: intent.id,
      providerPaymentId:     intent.payment_method as string | undefined,
      status:                mapStripeStatus(intent.status) as ChargeResult['status'],
      amount:                fromStripeAmount(intent.amount),
      currency:              intent.currency.toUpperCase(),
    }
  },

  // ── createInvoice ─────────────────────────────────────────────────────────
  async createInvoice(
    params: InvoiceParams,
    config: AdapterConfig
  ): Promise<InvoiceResult> {
    const stripe = getStripe(config)

    let customerId: string | undefined

    if (params.customerEmail) {
      const existing = await stripe.customers.list({ email: params.customerEmail, limit: 1 })
      if (existing.data.length > 0) {
        customerId = existing.data[0].id
      } else {
        const customer = await stripe.customers.create({
          email: params.customerEmail,
          metadata: { tenant_id: params.tenantId, customer_id: params.customerId ?? '' },
        })
        customerId = customer.id
      }
    }

    const invoice = await stripe.invoices.create({
      customer:       customerId,
      description:    params.description,
      due_date:       params.dueDate ? Math.floor(new Date(params.dueDate).getTime() / 1000) : undefined,
      collection_method: 'send_invoice',
      metadata: {
        tenant_id: params.tenantId,
        ...params.metadata,
      },
    })

    await stripe.invoiceItems.create({
      customer:    customerId ?? '',
      invoice:     invoice.id,
      amount:      toStripeAmount(params.amount),
      currency:    params.currency.toLowerCase(),
      description: params.title,
    })

    const finalized = await stripe.invoices.finalizeInvoice(invoice.id)

    return {
      providerInvoiceId: finalized.id,
      status:            finalized.status ?? 'draft',
      url:               finalized.hosted_invoice_url ?? undefined,
    }
  },

  // ── refundPayment ─────────────────────────────────────────────────────────
  async refundPayment(
    params: RefundParams,
    config: AdapterConfig
  ): Promise<RefundResult> {
    const stripe = getStripe(config)

    const refund = await stripe.refunds.create({
      payment_intent: params.providerTransactionId,
      amount:         toStripeAmount(params.amount),
      reason:         (params.reason ?? 'requested_by_customer') as Stripe.RefundCreateParams['reason'],
      metadata: {
        tenant_id: params.tenantId,
        ...params.metadata,
      },
    })

    return {
      providerRefundId: refund.id,
      status:           refund.status === 'succeeded' ? 'succeeded' : refund.status === 'pending' ? 'pending' : 'failed',
      amount:           fromStripeAmount(refund.amount),
    }
  },

  // ── cancelPayment ─────────────────────────────────────────────────────────
  async cancelPayment(
    params: CancelParams,
    config: AdapterConfig
  ): Promise<void> {
    const stripe = getStripe(config)
    await stripe.paymentIntents.cancel(params.providerTransactionId)
  },

  // ── handleWebhook ─────────────────────────────────────────────────────────
  async handleWebhook(
    rawBody:   string,
    signature: string,
    config:    AdapterConfig
  ): Promise<WebhookEvent> {
    const stripe = getStripe(config)

    if (!config.webhookSecret) {
      throw new Error('[StripeAdapter] webhookSecret is required for webhook verification')
    }

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret)
    } catch (err) {
      throw new Error(`[StripeAdapter] Webhook signature verification failed: ${(err as Error).message}`)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = event.data.object as any as Record<string, unknown>

    return {
      eventType:   event.type,
      externalId:  (obj.id as string | undefined) ?? undefined,
      status:      (obj.status as string | undefined) ?? undefined,
      amount:      typeof obj.amount === 'number' ? fromStripeAmount(obj.amount) : undefined,
      currency:    typeof obj.currency === 'string' ? (obj.currency as string).toUpperCase() : undefined,
      tenantId:    (obj.metadata as Record<string, string> | undefined)?.tenant_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      raw:         event as any as Record<string, unknown>,
    }
  },

  // ── getPaymentStatus ──────────────────────────────────────────────────────
  async getPaymentStatus(
    providerTransactionId: string,
    config: AdapterConfig
  ): Promise<PaymentStatusResult> {
    const stripe = getStripe(config)

    const intent = await stripe.paymentIntents.retrieve(providerTransactionId)

    return {
      status:   mapStripeStatus(intent.status) as PaymentStatusResult['status'],
      amount:   fromStripeAmount(intent.amount),
      currency: intent.currency.toUpperCase(),
    }
  },
}
