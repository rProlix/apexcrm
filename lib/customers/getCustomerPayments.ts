// lib/customers/getCustomerPayments.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface CustomerPaymentSummary {
  transactions: CustomerTransaction[]
  invoices:     CustomerInvoice[]
}

export interface CustomerTransaction {
  id:                      string
  invoice_id:              string | null
  provider_key:            string
  provider_transaction_id: string | null
  amount:                  number
  currency:                string
  status:                  string
  transaction_type:        string
  created_at:              string
}

export interface CustomerInvoice {
  id:             string
  invoice_number: string
  title:          string
  amount:         number
  currency:       string
  status:         string
  due_date:       string | null
  created_at:     string
}

/**
 * Returns payment transactions + invoices for a customer within a single tenant.
 * Strictly scoped by tenant_id + customer_id — no cross-tenant reads.
 */
export async function getCustomerPayments(
  tenantId:   string,
  customerId: string,
  limit:      number = 50
): Promise<CustomerPaymentSummary> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const [txResult, invoiceResult] = await Promise.all([
    supabase
      .from('payment_transactions')
      .select('id, invoice_id, provider_key, provider_transaction_id, amount, currency, status, transaction_type, created_at')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(limit),

    supabase
      .from('invoices')
      .select('id, invoice_number, title, amount, currency, status, due_date, created_at')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ])

  if (txResult.error) {
    console.error('[getCustomerPayments] transactions error:', txResult.error.message)
  }
  if (invoiceResult.error) {
    console.error('[getCustomerPayments] invoices error:', invoiceResult.error.message)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transactions = ((txResult.data ?? []) as any[]).map((t) => ({
    ...t,
    amount: Number(t.amount),
  })) as CustomerTransaction[]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = ((invoiceResult.data ?? []) as any[]).map((i) => ({
    ...i,
    amount: Number(i.amount),
  })) as CustomerInvoice[]

  return { transactions, invoices }
}
