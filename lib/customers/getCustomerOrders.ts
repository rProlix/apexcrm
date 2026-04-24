// lib/customers/getCustomerOrders.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface CustomerOrder {
  id:           string
  tenant_id:    string
  customer_id:  string
  status:       string
  total_amount: number
  created_at:   string
  order_items:  CustomerOrderItem[]
}

export interface CustomerOrderItem {
  id:         string
  product_id: string
  quantity:   number
  price:      number
  product?:   { name: string } | null
}

/**
 * Returns orders for a specific customer within a single tenant.
 * Strictly enforces tenant_id + customer_id — no cross-tenant reads.
 */
export async function getCustomerOrders(
  tenantId:   string,
  customerId: string,
  limit:      number = 50
): Promise<CustomerOrder[]> {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      tenant_id,
      customer_id,
      status,
      total_amount,
      created_at,
      order_items (
        id,
        product_id,
        quantity,
        price,
        products:product_id ( name )
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[getCustomerOrders]', error.message)
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    ...row,
    order_items: (row.order_items ?? []).map((item: any) => ({
      id:         item.id,
      product_id: item.product_id,
      quantity:   item.quantity,
      price:      Number(item.price),
      product:    Array.isArray(item.products) ? item.products[0] ?? null : item.products ?? null,
    })),
    total_amount: Number(row.total_amount),
  })) as CustomerOrder[]
}
