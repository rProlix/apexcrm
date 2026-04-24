// lib/payments/createInvoice.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPaymentSettings } from './getPaymentSettings'

export type InvoiceSourceType = 'product' | 'service' | 'appointment' | 'manual'

export interface InvoiceItemInput {
  name:        string
  description?: string
  quantity:    number
  unit_price:  number
  source_type?: InvoiceSourceType
  source_id?:  string
  metadata?:   Record<string, unknown>
}

export interface CreateInvoiceParams {
  tenantId:       string
  customerId?:    string
  contactId?:     string
  orderId?:       string
  appointmentId?: string
  title:          string
  description?:   string
  currency?:      string
  dueDate?:       string         // ISO string
  providerKey?:   string
  items:          InvoiceItemInput[]
  metadata?:      Record<string, unknown>
}

export interface CreatedInvoice {
  id:             string
  invoice_number: string
  amount:         number
  currency:       string
  status:         string
}

/**
 * Creates an invoice with its line items in the database.
 * Supports products, services, appointments, and manual charges.
 * Amount is calculated from items — never trusted from client.
 */
export async function createInvoice(params: CreateInvoiceParams): Promise<CreatedInvoice> {
  if (!params.items || params.items.length === 0) {
    throw new Error('[createInvoice] At least one item is required')
  }

  // Validate amounts
  for (const item of params.items) {
    if (item.unit_price < 0) throw new Error('[createInvoice] unit_price cannot be negative')
    if (item.quantity < 1)   throw new Error('[createInvoice] quantity must be >= 1')
  }

  const settings = await getPaymentSettings(params.tenantId)
  const currency  = params.currency ?? settings.currency

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  // Generate invoice number
  const { data: numData } = await supabase.rpc('generate_invoice_number', {
    p_tenant_id: params.tenantId,
  })
  const invoiceNumber = (numData as string | null) ?? `INV-${Date.now()}`

  // Calculate total (server-side — never trust client)
  const totalAmount = params.items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  )

  // Apply tax if configured
  const taxMultiplier = 1 + (Number(settings.tax_rate) / 100)
  const finalAmount   = Math.round(totalAmount * taxMultiplier * 100) / 100

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      tenant_id:      params.tenantId,
      customer_id:    params.customerId    ?? null,
      contact_id:     params.contactId    ?? null,
      order_id:       params.orderId      ?? null,
      appointment_id: params.appointmentId ?? null,
      invoice_number: invoiceNumber,
      title:          params.title,
      description:    params.description  ?? null,
      amount:         finalAmount,
      currency,
      status:         'draft',
      due_date:       params.dueDate      ?? null,
      provider_key:   params.providerKey  ?? null,
      metadata:       params.metadata     ?? null,
    })
    .select('id, invoice_number, amount, currency, status')
    .single()

  if (invErr || !invoice) {
    throw new Error(`[createInvoice] Invoice insert failed: ${invErr?.message}`)
  }

  // Insert invoice items
  const itemRows = params.items.map((item) => ({
    tenant_id:   params.tenantId,
    invoice_id:  invoice.id,
    name:        item.name,
    description: item.description ?? null,
    quantity:    item.quantity,
    unit_price:  item.unit_price,
    total_price: Math.round(item.unit_price * item.quantity * 100) / 100,
    source_type: item.source_type ?? null,
    source_id:   item.source_id   ?? null,
    metadata:    item.metadata    ?? null,
  }))

  const { error: itemErr } = await supabase.from('invoice_items').insert(itemRows)

  if (itemErr) {
    await supabase.from('invoices').delete().eq('id', invoice.id)
    throw new Error(`[createInvoice] Invoice items insert failed: ${itemErr.message}`)
  }

  return {
    id:             invoice.id,
    invoice_number: invoice.invoice_number,
    amount:         Number(invoice.amount),
    currency:       invoice.currency,
    status:         invoice.status,
  }
}

/**
 * Create an invoice from a store order.
 * Links invoice to the order and its products.
 */
export async function createInvoiceFromOrder(
  tenantId:   string,
  orderId:    string,
  customerId: string
): Promise<CreatedInvoice> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const { data: order } = await supabase
    .from('orders')
    .select('*, order_items(*, products(name, price))')
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .single()

  if (!order) throw new Error(`[createInvoiceFromOrder] Order ${orderId} not found`)

  const items: InvoiceItemInput[] = (order.order_items ?? []).map((oi: Record<string, unknown>) => ({
    name:        (oi.products as Record<string, unknown>)?.name as string ?? 'Product',
    quantity:    oi.quantity as number,
    unit_price:  oi.price as number,
    source_type: 'product' as InvoiceSourceType,
    source_id:   oi.product_id as string,
  }))

  return createInvoice({
    tenantId,
    customerId,
    orderId,
    title:       `Order Invoice`,
    description: `Payment for order ${orderId.slice(0, 8)}`,
    items,
  })
}

/**
 * Create an invoice from an appointment.
 */
export async function createInvoiceFromAppointment(
  tenantId:      string,
  appointmentId: string,
  customerId:    string
): Promise<CreatedInvoice> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const { data: appt } = await supabase
    .from('appointments')
    .select('*, appointment_services(name, price)')
    .eq('id', appointmentId)
    .eq('tenant_id', tenantId)
    .single()

  if (!appt) throw new Error(`[createInvoiceFromAppointment] Appointment ${appointmentId} not found`)

  const services = (appt.appointment_services ?? []) as Array<{ name: string; price: number }>

  const items: InvoiceItemInput[] = services.length > 0
    ? services.map((svc) => ({
        name:        svc.name,
        quantity:    1,
        unit_price:  Number(svc.price) || 0,
        source_type: 'appointment' as InvoiceSourceType,
        source_id:   appointmentId,
      }))
    : [
        {
          name:        'Appointment',
          quantity:    1,
          unit_price:  Number(appt.price) || 0,
          source_type: 'appointment' as InvoiceSourceType,
          source_id:   appointmentId,
        },
      ]

  return createInvoice({
    tenantId,
    customerId,
    appointmentId,
    title:       'Appointment Invoice',
    description: `Payment for appointment on ${new Date(appt.start_time ?? appt.scheduled_at ?? appt.created_at).toLocaleDateString()}`,
    items,
  })
}
