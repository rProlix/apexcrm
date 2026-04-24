// lib/payments/getCustomerTransactions.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface CustomerTransaction {
  id:                     string
  invoice_id:             string | null
  provider_key:           string
  provider_transaction_id: string | null
  amount:                 number
  currency:               string
  status:                 string
  transaction_type:       string
  created_at:             string
  invoice?:               {
    invoice_number: string
    title:          string
    status:         string
  } | null
}

/**
 * Fetches all transactions for a customer within a specific tenant.
 * Strictly scoped by both tenant_id and customer_id.
 */
export async function getCustomerTransactions(
  tenantId:   string,
  customerId: string,
  limit:      number = 50
): Promise<CustomerTransaction[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const { data, error } = await supabase
    .from('payment_transactions')
    .select(`
      id,
      invoice_id,
      provider_key,
      provider_transaction_id,
      amount,
      currency,
      status,
      transaction_type,
      created_at,
      invoices:invoice_id (
        invoice_number,
        title,
        status
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[getCustomerTransactions] Error:', error.message)
    return []
  }

  return (data ?? []) as CustomerTransaction[]
}

export interface CustomerInvoice {
  id:             string
  invoice_number: string
  title:          string
  description:    string | null
  amount:         number
  currency:       string
  status:         string
  due_date:       string | null
  created_at:     string
  invoice_items?: Array<{
    name:        string
    quantity:    number
    unit_price:  number
    total_price: number
  }>
}

/**
 * Fetches all invoices for a customer within a specific tenant.
 * Strictly scoped by both tenant_id and customer_id.
 */
export async function getCustomerInvoices(
  tenantId:   string,
  customerId: string,
  limit:      number = 50
): Promise<CustomerInvoice[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const { data, error } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      title,
      description,
      amount,
      currency,
      status,
      due_date,
      created_at,
      invoice_items (
        name,
        quantity,
        unit_price,
        total_price
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[getCustomerInvoices] Error:', error.message)
    return []
  }

  return (data ?? []) as CustomerInvoice[]
}

/**
 * Fetches a single invoice by ID, strictly scoped to tenant + customer.
 * Returns null if not found or does not belong to the customer.
 */
export async function getCustomerInvoiceById(
  tenantId:   string,
  customerId: string,
  invoiceId:  string
): Promise<CustomerInvoice | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const { data } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      title,
      description,
      amount,
      currency,
      status,
      due_date,
      created_at,
      invoice_items (
        name,
        quantity,
        unit_price,
        total_price
      )
    `)
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle()

  return data as CustomerInvoice | null
}
