import 'server-only'

import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { RewardBranding, WalletPassDomainModel } from '@/types/rewards'
import {
  decryptRewardToken,
  encryptRewardToken,
  generateOpaqueToken,
  hashRewardToken,
  tokenMatches,
} from '../security'
import { ensureRewardMembership } from '../membership'
import { AppleWalletProvider } from './apple-provider'
import { getAppleWalletConfigurationStatus, getAppleWalletSigningConfiguration } from './config'

export class AppleWalletUnavailableError extends Error {}

export async function issueAppleWalletPass(input: {
  tenantId: string
  customerId: string
  programId: string
}): Promise<{ buffer: Buffer; serialNumber: string }> {
  if (!getAppleWalletConfigurationStatus().configured) {
    throw new AppleWalletUnavailableError('Apple Wallet is currently unavailable')
  }
  const db = getSupabaseServerClient() as any
  const { membership, barcodeToken } = await ensureRewardMembership(input)
  let { data: walletPass } = await db
    .from('wallet_passes')
    .select('*')
    .eq('membership_id', membership.id)
    .eq('provider', 'apple')
    .maybeSingle()

  let authenticationToken: string
  if (!walletPass) {
    authenticationToken = generateOpaqueToken(32)
    const { data, error } = await db
      .from('wallet_passes')
      .insert({
        tenant_id: input.tenantId,
        customer_id: input.customerId,
        program_id: input.programId,
        membership_id: membership.id,
        provider: 'apple',
        authentication_token_hash: hashRewardToken(authenticationToken),
        authentication_token_ciphertext: encryptRewardToken(authenticationToken),
      })
      .select('*')
      .single()
    if (error || !data) throw new Error(`Unable to issue Wallet pass: ${error?.code ?? 'unknown'}`)
    walletPass = data
  } else {
    authenticationToken = decryptRewardToken(walletPass.authentication_token_ciphertext)
  }

  const model = await buildWalletPassModel({ ...input, barcodeToken, membership })
  const provider = new AppleWalletProvider()
  const buffer = await provider.generatePass(model, {
    serialNumber: walletPass.serial_number,
    authenticationToken,
    updatedAt: walletPass.updated_at,
  })
  await Promise.all([
    db
      .from('wallet_passes')
      .update({ last_generated_at: new Date().toISOString() })
      .eq('id', walletPass.id),
    db.from('reward_analytics_events').insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      program_id: input.programId,
      event_name: 'apple_wallet_pass_downloaded',
      source_type: 'wallet_pass',
      source_id: walletPass.id,
    }),
  ])
  return { buffer, serialNumber: walletPass.serial_number }
}

async function buildWalletPassModel(input: {
  tenantId: string
  customerId: string
  programId: string
  barcodeToken: string
  membership: any
}): Promise<WalletPassDomainModel> {
  const db = getSupabaseServerClient() as any
  const [
    tenantResult,
    customerResult,
    programResult,
    balanceResult,
    tierResult,
    punchResult,
    rewardResult,
  ] = await Promise.all([
    db.from('tenants').select('name,branding').eq('id', input.tenantId).single(),
    db
      .from('customers')
      .select('name')
      .eq('tenant_id', input.tenantId)
      .eq('id', input.customerId)
      .single(),
    db
      .from('rewards_programs')
      .select('*')
      .eq('tenant_id', input.tenantId)
      .eq('id', input.programId)
      .single(),
    db
      .from('rewards_balances')
      .select('points_balance,lifetime_points_earned')
      .eq('tenant_id', input.tenantId)
      .eq('customer_id', input.customerId)
      .maybeSingle(),
    db
      .from('reward_customer_tiers')
      .select('qualification_value,reward_tiers(name,threshold)')
      .eq('tenant_id', input.tenantId)
      .eq('customer_id', input.customerId)
      .eq('program_id', input.programId)
      .maybeSingle(),
    db
      .from('reward_punch_cards')
      .select('title,current_punches,punch_goal')
      .eq('tenant_id', input.tenantId)
      .eq('customer_id', input.customerId)
      .eq('program_id', input.programId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('reward_shop_items')
      .select('name,points_cost')
      .eq('tenant_id', input.tenantId)
      .or(`program_id.eq.${input.programId},program_id.is.null`)
      .eq('is_active', true)
      .order('points_cost')
      .limit(1)
      .maybeSingle(),
  ])
  if (!programResult.data || !customerResult.data || !tenantResult.data)
    throw new Error('Wallet pass account not found')
  const program = programResult.data
  const programBrand = (program.branding ?? {}) as RewardBranding
  const tenantBrand = (tenantResult.data.branding ?? {}) as Record<string, string>
  const currentPoints = Number(balanceResult.data?.points_balance ?? 0)
  const tierJoin = tierResult.data?.reward_tiers as { name?: string; threshold?: number } | null
  const nextReward = rewardResult.data

  return {
    membershipName:
      programBrand.program_name || program.name || `${tenantResult.data.name} Rewards`,
    customerDisplayName: customerResult.data.name,
    membershipNumber: input.membership.membership_number,
    pointsBalance: currentPoints,
    pointsLabel: program.points_name || 'points',
    tier: tierJoin?.name ?? null,
    tierProgress: tierJoin
      ? {
          current: Number(tierResult.data?.qualification_value ?? 0),
          target: Number(tierJoin.threshold ?? 0),
          label: 'Tier progress',
        }
      : null,
    punchProgress: punchResult.data
      ? {
          current: punchResult.data.current_punches,
          target: punchResult.data.punch_goal,
          label: punchResult.data.title,
        }
      : null,
    nextReward: nextReward
      ? `${nextReward.name} at ${Number(nextReward.points_cost).toLocaleString()} ${program.points_abbreviation || 'pts'}`
      : null,
    barcodeToken: input.barcodeToken,
    brandColors: {
      background: programBrand.background_color || tenantBrand.primary_color || '#121214',
      foreground: programBrand.foreground_color || '#ffffff',
      label: programBrand.label_color || tenantBrand.accent_color || '#d6b253',
    },
    logoUrl: programBrand.logo_url || tenantBrand.logo_url || null,
    terms: programBrand.terms || null,
    supportUrl: programBrand.support_url || null,
  }
}

export async function getWalletPassForProtocol(
  passTypeIdentifier: string,
  serialNumber: string,
  token: string
) {
  const expectedPassType = getAppleWalletSigningConfiguration().passTypeIdentifier
  if (passTypeIdentifier !== expectedPassType) return null
  const db = getSupabaseServerClient() as any
  const { data: pass } = await db
    .from('wallet_passes')
    .select('*')
    .eq('provider', 'apple')
    .eq('serial_number', serialNumber)
    .eq('status', 'active')
    .maybeSingle()
  if (!pass || !tokenMatches(token, pass.authentication_token_hash)) return null
  return pass
}

export function applePassToken(authorization: string | null): string | null {
  const match = /^ApplePass\s+(.+)$/i.exec(authorization ?? '')
  return match?.[1]?.trim() || null
}
