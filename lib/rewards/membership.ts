import 'server-only'

import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  decryptRewardToken,
  encryptRewardToken,
  generateOpaqueToken,
  hashRewardToken,
} from './security'

export async function ensureRewardMembership(input: {
  tenantId: string
  customerId: string
  programId: string
}) {
  const db = getSupabaseServerClient() as any
  const { data: existing } = await db
    .from('reward_memberships')
    .select('*')
    .eq('tenant_id', input.tenantId)
    .eq('customer_id', input.customerId)
    .eq('program_id', input.programId)
    .maybeSingle()

  if (existing && existing.barcode_token_ciphertext !== 'pending-rotation') {
    return {
      membership: existing,
      barcodeToken: decryptRewardToken(existing.barcode_token_ciphertext),
    }
  }

  const barcodeToken = `nex_rw_${generateOpaqueToken(24)}`
  const values = {
    tenant_id: input.tenantId,
    customer_id: input.customerId,
    program_id: input.programId,
    membership_number: existing?.membership_number ?? `RW-${generateOpaqueToken(8).toUpperCase()}`,
    barcode_token_hash: hashRewardToken(barcodeToken),
    barcode_token_ciphertext: encryptRewardToken(barcodeToken),
    status: 'active',
    updated_at: new Date().toISOString(),
  }
  const query = existing
    ? db.from('reward_memberships').update(values).eq('id', existing.id)
    : db.from('reward_memberships').insert(values)
  const { data, error } = await query.select('*').single()
  if (error || !data)
    throw new Error(`Unable to provision reward membership: ${error?.code ?? 'unknown'}`)
  return { membership: data, barcodeToken }
}

export async function resolveMembershipBarcode(tenantId: string, rawToken: string) {
  const hash = hashRewardToken(rawToken)
  const { data } = await (getSupabaseServerClient() as any)
    .from('reward_memberships')
    .select('id,tenant_id,customer_id,program_id,membership_number,status')
    .eq('tenant_id', tenantId)
    .eq('barcode_token_hash', hash)
    .eq('status', 'active')
    .maybeSingle()
  return data ?? null
}
