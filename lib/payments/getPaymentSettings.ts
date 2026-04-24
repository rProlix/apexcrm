// lib/payments/getPaymentSettings.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface PaymentSettings {
  id:                       string
  tenant_id:                string
  default_provider:         string
  currency:                 string
  tax_rate:                 number
  allow_manual_invoices:    boolean
  allow_saved_payment_methods: boolean
  allow_partial_payments:   boolean
  receipt_email_enabled:    boolean
  webhook_secret:           Record<string, string> | null
  created_at:               string
  updated_at:               string
}

/**
 * Fetches or bootstraps the payment_settings row for a tenant.
 * Always returns a settings object — creates defaults if none exist.
 */
export async function getPaymentSettings(tenantId: string): Promise<PaymentSettings> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const { data: existing } = await supabase
    .from('payment_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (existing) return existing as PaymentSettings

  const { data: created, error } = await supabase
    .from('payment_settings')
    .insert({ tenant_id: tenantId })
    .select('*')
    .single()

  if (error || !created) {
    throw new Error(`[getPaymentSettings] Failed to bootstrap settings for tenant ${tenantId}: ${error?.message}`)
  }

  return created as PaymentSettings
}

/**
 * Updates payment settings for a tenant (upsert).
 */
export async function upsertPaymentSettings(
  tenantId: string,
  updates:  Partial<Omit<PaymentSettings, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>>
): Promise<PaymentSettings> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const { data, error } = await supabase
    .from('payment_settings')
    .upsert({ tenant_id: tenantId, ...updates }, { onConflict: 'tenant_id' })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`[upsertPaymentSettings] ${error?.message}`)
  }

  return data as PaymentSettings
}
