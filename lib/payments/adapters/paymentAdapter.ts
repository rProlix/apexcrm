// lib/payments/adapters/paymentAdapter.ts

export type ProviderKey = 'stripe' | 'square'

export interface PaymentLinkParams {
  title:      string
  amount:     number        // in major currency units (e.g. 10.00 for $10)
  currency:   string
  tenantId:   string
  invoiceId?: string
  metadata?:  Record<string, string>
  successUrl?: string
  cancelUrl?:  string
}

export interface PaymentLinkResult {
  providerLinkId: string
  url:            string
}

export interface ChargeParams {
  amount:       number
  currency:     string
  tenantId:     string
  customerId?:  string
  invoiceId?:   string
  description?: string
  source?:      string       // payment source token or method id
  metadata?:    Record<string, string>
}

export interface ChargeResult {
  providerTransactionId: string
  providerPaymentId?:    string
  status:                'pending' | 'succeeded' | 'failed'
  amount:                number
  currency:              string
}

export interface InvoiceParams {
  tenantId:     string
  customerId?:  string
  customerEmail?: string
  title:        string
  description?: string
  amount:       number
  currency:     string
  dueDate?:     string
  metadata?:    Record<string, string>
}

export interface InvoiceResult {
  providerInvoiceId: string
  status:            string
  url?:              string
}

export interface RefundParams {
  providerTransactionId: string
  amount:                number
  currency:              string
  tenantId:              string
  reason?:               string
  metadata?:             Record<string, string>
}

export interface RefundResult {
  providerRefundId: string
  status:           'pending' | 'succeeded' | 'failed'
  amount:           number
}

export interface CancelParams {
  providerTransactionId: string
  tenantId:              string
}

export interface WebhookEvent {
  eventType:    string
  tenantId?:    string
  externalId?:  string
  status?:      string
  amount?:      number
  currency?:    string
  raw:          Record<string, unknown>
}

export interface PaymentStatusResult {
  status:   'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded'
  amount?:  number
  currency?: string
}

export interface AdapterConfig {
  secretKey:    string
  webhookSecret?: string
  accountId?:   string     // Square location or Stripe account
  [key: string]: unknown
}

/**
 * Canonical payment provider adapter interface.
 * All provider adapters must implement every method.
 */
export interface PaymentAdapter {
  readonly providerKey: ProviderKey

  /** Create a hosted payment link / checkout session */
  createPaymentLink(params: PaymentLinkParams, config: AdapterConfig): Promise<PaymentLinkResult>

  /** Charge a customer directly (card present / saved method) */
  createCharge(params: ChargeParams, config: AdapterConfig): Promise<ChargeResult>

  /** Create a provider-side invoice */
  createInvoice(params: InvoiceParams, config: AdapterConfig): Promise<InvoiceResult>

  /** Refund a previous charge */
  refundPayment(params: RefundParams, config: AdapterConfig): Promise<RefundResult>

  /** Cancel / void a pending payment */
  cancelPayment(params: CancelParams, config: AdapterConfig): Promise<void>

  /** Verify and parse an incoming webhook payload */
  handleWebhook(
    rawBody:   string,
    signature: string,
    config:    AdapterConfig
  ): Promise<WebhookEvent>

  /** Query the current status of a transaction from the provider */
  getPaymentStatus(
    providerTransactionId: string,
    config: AdapterConfig
  ): Promise<PaymentStatusResult>
}
