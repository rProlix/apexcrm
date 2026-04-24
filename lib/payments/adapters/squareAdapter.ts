// lib/payments/adapters/squareAdapter.ts
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

// Square SDK is imported lazily to avoid issues when not configured
async function getSquareClient(config: AdapterConfig) {
  if (!config.secretKey) throw new Error('[SquareAdapter] secretKey (access token) is required')

  // The square npm package v43+ exports SquareClient
  const sq = await import('square')
  // Support both old and new Square SDK shapes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const squarePkg = sq as any
  const ClientCtor = squarePkg.SquareClient ?? squarePkg.Client
  const envVal = process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'

  return new ClientCtor({
    accessToken:      config.secretKey,
    environment:      envVal,
  })
}

function toSquareMoney(amount: number, currency: string) {
  return {
    amount:   BigInt(Math.round(amount * 100)),
    currency: currency.toUpperCase(),
  }
}

function fromSquareAmount(amount: bigint | null | undefined): number {
  if (!amount) return 0
  return Number(amount) / 100
}

function mapSquareStatus(status: string | undefined): 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded' {
  switch (status) {
    case 'COMPLETED':  return 'succeeded'
    case 'CANCELED':   return 'canceled'
    case 'FAILED':     return 'failed'
    default:           return 'pending'
  }
}

function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const squareAdapter: PaymentAdapter = {
  providerKey: 'square',

  // ── createPaymentLink ──────────────────────────────────────────────────────
  async createPaymentLink(
    params: PaymentLinkParams,
    config: AdapterConfig
  ): Promise<PaymentLinkResult> {
    const client = await getSquareClient(config)

    const response = await client.checkoutApi.createPaymentLink({
      idempotencyKey: generateIdempotencyKey(),
      order: {
        locationId: (config.accountId as string) ?? '',
        lineItems: [
          {
            name:     params.title,
            quantity: '1',
            basePriceMoney: toSquareMoney(params.amount, params.currency),
          },
        ],
      },
      checkoutOptions: {
        redirectUrl: params.successUrl ?? `${process.env.NEXT_PUBLIC_APP_URL}/payments/success`,
      },
    })

    const link = response.result.paymentLink

    if (!link) {
      throw new Error('[SquareAdapter] Failed to create payment link — no result returned')
    }

    return {
      providerLinkId: link.id ?? '',
      url:            link.url ?? '',
    }
  },

  // ── createCharge ──────────────────────────────────────────────────────────
  async createCharge(
    params: ChargeParams,
    config: AdapterConfig
  ): Promise<ChargeResult> {
    const client = await getSquareClient(config)

    const response = await client.paymentsApi.createPayment({
      idempotencyKey:  generateIdempotencyKey(),
      sourceId:        params.source ?? 'CASH',
      amountMoney:     toSquareMoney(params.amount, params.currency),
      locationId:      (config.accountId as string) ?? '',
      referenceId:     params.invoiceId,
      note:            params.description,
    })

    const payment = response.result.payment

    if (!payment) {
      throw new Error('[SquareAdapter] Failed to create charge — no payment returned')
    }

    return {
      providerTransactionId: payment.id ?? '',
      status:                mapSquareStatus(payment.status) as ChargeResult['status'],
      amount:                fromSquareAmount(payment.amountMoney?.amount),
      currency:              payment.amountMoney?.currency ?? params.currency,
    }
  },

  // ── createInvoice ─────────────────────────────────────────────────────────
  async createInvoice(
    params: InvoiceParams,
    config: AdapterConfig
  ): Promise<InvoiceResult> {
    // TODO: Full Square invoice flow requires customer + order creation first.
    // For now, create a payment link as a proxy for invoice workflow.
    const linkResult = await squareAdapter.createPaymentLink(
      {
        title:     params.title,
        amount:    params.amount,
        currency:  params.currency,
        tenantId:  params.tenantId,
        metadata:  params.metadata,
      },
      config
    )

    return {
      providerInvoiceId: linkResult.providerLinkId,
      status:            'pending',
      url:               linkResult.url,
    }
  },

  // ── refundPayment ─────────────────────────────────────────────────────────
  async refundPayment(
    params: RefundParams,
    config: AdapterConfig
  ): Promise<RefundResult> {
    const client = await getSquareClient(config)

    const response = await client.refundsApi.refundPayment({
      idempotencyKey: generateIdempotencyKey(),
      paymentId:      params.providerTransactionId,
      amountMoney:    toSquareMoney(params.amount, params.currency),
      reason:         params.reason,
    })

    const refund = response.result.refund

    if (!refund) {
      throw new Error('[SquareAdapter] Failed to create refund — no result returned')
    }

    return {
      providerRefundId: refund.id ?? '',
      status:           refund.status === 'COMPLETED' ? 'succeeded' : refund.status === 'PENDING' ? 'pending' : 'failed',
      amount:           fromSquareAmount(refund.amountMoney?.amount),
    }
  },

  // ── cancelPayment ─────────────────────────────────────────────────────────
  async cancelPayment(
    params: CancelParams,
    config: AdapterConfig
  ): Promise<void> {
    const client = await getSquareClient(config)
    await client.paymentsApi.cancelPayment(params.providerTransactionId)
  },

  // ── handleWebhook ─────────────────────────────────────────────────────────
  async handleWebhook(
    rawBody:   string,
    _signature: string,
    _config:    AdapterConfig
  ): Promise<WebhookEvent> {
    // Square webhook signature verification uses HMAC-SHA256
    // Full verification: compare X-Square-Hmacsha256-Signature with
    // HMAC-SHA256(webhookSecret, notificationUrl + rawBody)
    // TODO: implement full Square HMAC verification when webhookSecret is set

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawBody)
    } catch {
      throw new Error('[SquareAdapter] Failed to parse webhook payload')
    }

    const eventType = payload.type as string | undefined
    const data      = payload.data as Record<string, unknown> | undefined
    const obj       = data?.object as Record<string, unknown> | undefined
    const payment   = obj?.payment as Record<string, unknown> | undefined

    return {
      eventType:  eventType ?? 'unknown',
      externalId: (payment?.id as string | undefined) ?? undefined,
      status:     (payment?.status as string | undefined) ?? undefined,
      amount:     payment?.amount_money
        ? fromSquareAmount(BigInt((payment.amount_money as Record<string, number>).amount ?? 0))
        : undefined,
      currency: payment?.amount_money
        ? ((payment.amount_money as Record<string, string>).currency ?? 'USD')
        : undefined,
      raw: payload,
    }
  },

  // ── getPaymentStatus ──────────────────────────────────────────────────────
  async getPaymentStatus(
    providerTransactionId: string,
    config: AdapterConfig
  ): Promise<PaymentStatusResult> {
    const client = await getSquareClient(config)

    const response = await client.paymentsApi.getPayment(providerTransactionId)
    const payment  = response.result.payment

    return {
      status:   mapSquareStatus(payment?.status) as PaymentStatusResult['status'],
      amount:   fromSquareAmount(payment?.amountMoney?.amount),
      currency: payment?.amountMoney?.currency ?? 'USD',
    }
  },
}
