import { X509Certificate } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/requireRole'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getAppleWalletConfigurationStatus } from '@/lib/rewards/wallet/config'

export const runtime = 'nodejs'

export async function GET() {
  await requireOwner()
  const db = getSupabaseServerClient() as any
  const [programs, members, passes, registrations, failures, events, redemptions] =
    await Promise.all([
      db
        .from('rewards_programs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      db
        .from('reward_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      db.from('wallet_passes').select('id', { count: 'exact', head: true }),
      db.from('wallet_pass_registrations').select('device_id', { count: 'exact', head: true }),
      db
        .from('wallet_update_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed'),
      db
        .from('reward_analytics_events')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 86400000).toISOString()),
      db
        .from('reward_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'redeemed'),
    ])
  let certificateExpiresAt: string | null = null
  let certificateDaysRemaining: number | null = null
  try {
    const value = process.env.APPLE_WALLET_CERTIFICATE_BASE64
    if (value) {
      const certificate = new X509Certificate(Buffer.from(value, 'base64'))
      certificateExpiresAt = new Date(certificate.validTo).toISOString()
      certificateDaysRemaining = Math.floor(
        (new Date(certificate.validTo).getTime() - Date.now()) / 86400000
      )
    }
  } catch {
    certificateExpiresAt = null
  }
  return NextResponse.json({
    wallet_configuration: getAppleWalletConfigurationStatus(),
    certificate: { expires_at: certificateExpiresAt, days_remaining: certificateDaysRemaining },
    metrics: {
      active_programs: programs.count ?? 0,
      reward_members: members.count ?? 0,
      wallet_passes_issued: passes.count ?? 0,
      wallet_registrations: registrations.count ?? 0,
      wallet_update_failures: failures.count ?? 0,
      reward_events_today: events.count ?? 0,
      rewards_redeemed: redemptions.count ?? 0,
    },
  })
}
