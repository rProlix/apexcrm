import Link from 'next/link'
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getRewardsProgram } from '@/lib/rewards/getRewardsProgram'
import { getAppleWalletConfigurationStatus } from '@/lib/rewards/wallet/config'
import { RewardsSettingsClient } from '@/components/rewards/RewardsSettingsClient'

export default async function RewardsSettingsPage() {
  const ctx = await requireRole(['owner', 'admin'])
  const tenantId = ctx.tenant_id ?? ''
  if (tenantId) await guardModuleAccess(tenantId, 'rewards', ctx.role)
  const program = await getRewardsProgram(tenantId)
  const wallet = getAppleWalletConfigurationStatus()
  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Rewards settings</h1>
        <p className="mt-1 text-sm text-white/40">
          Program behavior, expiration, redemptions, notifications, branding, and Wallet
          availability.
        </p>
      </header>
      {program ? (
        <RewardsSettingsClient program={program} />
      ) : (
        <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center">
          <p className="text-sm text-white/50">
            Create an active rewards program before configuring settings.
          </p>
          <Link
            href="/dashboard/rewards/programs"
            className="mt-4 inline-flex rounded-xl bg-gold-400 px-4 py-2 text-sm font-semibold text-graphite-950"
          >
            Create program
          </Link>
        </div>
      )}
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <h2 className="font-medium text-white">Apple Wallet infrastructure</h2>
        <p className="mt-1 text-xs text-white/40">Presence only. Secret values are never shown.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries({
            'Pass Type ID': wallet.passTypeId,
            'Team ID': wallet.teamId,
            'Signing certificate': wallet.certificate,
            'Private key': wallet.privateKey,
            'WWDR certificate': wallet.wwdrCertificate,
            'Update service URL': wallet.webServiceUrl,
            'Token encryption key': wallet.tokenEncryptionKey,
          }).map(([label, configured]) => (
            <div
              key={label}
              className="flex items-center justify-between rounded-xl border border-white/8 px-3 py-2.5"
            >
              <span className="text-xs text-white/50">{label}</span>
              <span
                className={`text-xs font-medium ${configured ? 'text-emerald-400' : 'text-orange-300'}`}
              >
                {configured ? 'Configured' : 'Missing'}
              </span>
            </div>
          ))}
        </div>
        {ctx.role !== 'owner' && (
          <p className="mt-4 text-xs text-white/35">
            Only the platform owner can configure signing infrastructure.
          </p>
        )}
      </section>
    </div>
  )
}
