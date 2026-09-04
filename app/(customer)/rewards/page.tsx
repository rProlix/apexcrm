export const dynamic = 'force-dynamic'

import Image from 'next/image'
import Link from 'next/link'
import { headers } from 'next/headers'
import QRCode from 'qrcode'
import { Gift, History, Share2, Sparkles, Star, Ticket, WalletCards } from 'lucide-react'
import { requireCustomerAuth } from '@/lib/auth/customerGuard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getCustomerRewardsBalanceSafe } from '@/lib/rewards/getCustomerRewardsBalance'
import { getRewardsProgram } from '@/lib/rewards/getRewardsProgram'
import { getActivePunchCards } from '@/lib/rewards/getPunchCardProgress'
import { ensureRewardMembership } from '@/lib/rewards/membership'
import { getAppleWalletConfigurationStatus } from '@/lib/rewards/wallet/config'

export const metadata = { title: 'My Rewards' }

export default async function CustomerRewardsPage() {
  const host = (await headers()).get('host') ?? ''
  const ctx = await requireCustomerAuth(host)
  const db = getSupabaseServerClient() as any
  const program = await getRewardsProgram(ctx.tenant_id)
  const [
    balance,
    punchCards,
    customerResult,
    rewardsResult,
    transactionsResult,
    promotionsResult,
    tierResult,
    tiersResult,
  ] = await Promise.all([
    getCustomerRewardsBalanceSafe(ctx.tenant_id, ctx.customer_id),
    getActivePunchCards(ctx.tenant_id, ctx.customer_id),
    db
      .from('customers')
      .select('name')
      .eq('tenant_id', ctx.tenant_id)
      .eq('id', ctx.customer_id)
      .single(),
    db
      .from('reward_shop_items')
      .select('id,name,description,points_cost,image_url,reward_type')
      .eq('tenant_id', ctx.tenant_id)
      .eq('is_active', true)
      .order('points_cost')
      .limit(6),
    db
      .from('rewards_transactions')
      .select('id,points_delta,transaction_type,description,created_at,expires_at')
      .eq('tenant_id', ctx.tenant_id)
      .eq('customer_id', ctx.customer_id)
      .order('created_at', { ascending: false })
      .limit(8),
    db
      .from('reward_promotions')
      .select('id,name,rule_type,multiplier,bonus_points,ends_at')
      .eq('tenant_id', ctx.tenant_id)
      .eq('status', 'active')
      .lte('starts_at', new Date().toISOString())
      .gt('ends_at', new Date().toISOString())
      .limit(4),
    program
      ? db
          .from('reward_customer_tiers')
          .select('qualification_value,reward_tiers(id,name,rank,threshold,color)')
          .eq('tenant_id', ctx.tenant_id)
          .eq('customer_id', ctx.customer_id)
          .eq('program_id', program.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    program
      ? db
          .from('reward_tiers')
          .select('id,name,rank,threshold,color')
          .eq('tenant_id', ctx.tenant_id)
          .eq('program_id', program.id)
          .eq('enabled', true)
          .order('rank')
      : Promise.resolve({ data: [] }),
  ])

  let membership: any = null
  let qrDataUrl: string | null = null
  if (program && process.env.REWARDS_TOKEN_ENCRYPTION_KEY) {
    try {
      const provisioned = await ensureRewardMembership({
        tenantId: ctx.tenant_id,
        customerId: ctx.customer_id,
        programId: program.id,
      })
      membership = provisioned.membership
      qrDataUrl = await QRCode.toDataURL(provisioned.barcodeToken, {
        width: 320,
        margin: 2,
        color: { dark: '#111214', light: '#ffffff' },
      })
    } catch {
      membership = null
    }
  }

  const walletStatus = getAppleWalletConfigurationStatus()
  const currentTier = tierResult.data?.reward_tiers as {
    name: string
    rank: number
    threshold: number
    color: string | null
  } | null
  const nextTier = (tiersResult.data ?? []).find(
    (tier: any) => Number(tier.rank) > Number(currentTier?.rank ?? -1)
  )
  const tierValue = Number(tierResult.data?.qualification_value ?? balance.lifetime_points_earned)
  const nextReward = (rewardsResult.data ?? []).find(
    (reward: any) => Number(reward.points_cost) > balance.points_balance
  )
  const rewardTarget = Number(nextReward?.points_cost ?? Math.max(balance.points_balance, 1))
  const rewardProgress = Math.min(100, Math.round((balance.points_balance / rewardTarget) * 100))
  const firstName = String(customerResult.data?.name ?? 'there').split(/\s+/)[0]

  return (
    <div className="space-y-7">
      <section className="grid gap-4 lg:grid-cols-[1.45fr_0.85fr]">
        <div className="relative overflow-hidden rounded-2xl border border-gold-400/25 bg-graphite-900 p-6 sm:p-8">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-300/80 to-transparent" />
          <div className="relative flex h-full flex-col justify-between gap-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-white/55">Welcome back, {firstName}</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                  {program?.name ?? 'Your rewards'}
                </h1>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-gold-400/25 bg-gold-400/10">
                <Star className="h-5 w-5 text-gold-300" aria-hidden="true" />
              </div>
            </div>
            <div>
              <p className="text-5xl font-semibold tracking-[-0.045em] text-white tabular-nums sm:text-6xl">
                {balance.points_balance.toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-white/50">
                {program?.points_name ?? 'points'} available
              </p>
              {nextReward && (
                <div className="mt-6 max-w-md">
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                    <span className="text-white/55">
                      {Math.max(0, rewardTarget - balance.points_balance).toLocaleString()} points
                      to {nextReward.name}
                    </span>
                    <span className="text-white/40">{rewardProgress}%</span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-white/10"
                    role="progressbar"
                    aria-label={`Progress to ${nextReward.name}`}
                    aria-valuemin={0}
                    aria-valuemax={rewardTarget}
                    aria-valuenow={balance.points_balance}
                  >
                    <div
                      className="h-full rounded-full bg-gold-400 transition-[width] duration-200 motion-reduce:transition-none"
                      style={{ width: `${rewardProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
          <p className="text-sm font-medium text-white">{currentTier?.name ?? 'Member'}</p>
          {nextTier ? (
            <>
              <p className="mt-5 text-3xl font-semibold text-white tabular-nums">
                {tierValue.toLocaleString()}{' '}
                <span className="text-base font-normal text-white/35">
                  / {Number(nextTier.threshold).toLocaleString()}
                </span>
              </p>
              <p className="mt-1 text-xs text-white/45">
                {Math.max(0, Number(nextTier.threshold) - tierValue).toLocaleString()} until{' '}
                {nextTier.name}
              </p>
              <div
                className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-label={`Progress to ${nextTier.name}`}
                aria-valuemin={0}
                aria-valuemax={Number(nextTier.threshold)}
                aria-valuenow={tierValue}
              >
                <div
                  className="h-full rounded-full bg-gold-400"
                  style={{
                    width: `${Math.min(100, (tierValue / Number(nextTier.threshold)) * 100)}%`,
                  }}
                />
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-white/45">Your highest available tier.</p>
          )}
          <div className="mt-7 grid grid-cols-2 gap-3 border-t border-white/8 pt-5">
            <div>
              <p className="text-lg font-semibold text-white tabular-nums">
                {balance.lifetime_points_earned.toLocaleString()}
              </p>
              <p className="text-xs text-white/40">Lifetime earned</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-white tabular-nums">
                {balance.lifetime_points_redeemed.toLocaleString()}
              </p>
              <p className="text-xs text-white/40">Redeemed</p>
            </div>
          </div>
        </div>
      </section>

      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Rewards sections">
        {[
          { href: '/rewards/shop', label: 'Rewards', Icon: Gift },
          { href: '/rewards/punch-cards', label: 'Punch Cards', Icon: Ticket },
          { href: '/rewards/history', label: 'History', Icon: History },
          { href: '#wallet', label: 'Wallet', Icon: WalletCards },
        ].map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/65 transition hover:border-gold-400/30 hover:text-white active:scale-[0.98]"
          >
            <Icon className="h-4 w-4 text-gold-300" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>

      {punchCards.length > 0 && (
        <section aria-labelledby="punch-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="punch-heading" className="text-base font-semibold text-white">
              Punch cards
            </h2>
            <Link href="/rewards/punch-cards" className="text-xs text-gold-300">
              View all
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {punchCards.slice(0, 2).map((card) => (
              <article
                key={card.id}
                className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-white">{card.title}</h3>
                    <p className="mt-1 text-xs text-white/45">
                      {Math.max(0, card.punch_goal - card.current_punches)} visits until your reward
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-gold-300 tabular-nums">
                    {card.current_punches} / {card.punch_goal}
                  </span>
                </div>
                <div
                  className="mt-5 flex flex-wrap gap-2"
                  role="img"
                  aria-label={`${card.current_punches} of ${card.punch_goal} punches earned`}
                >
                  {Array.from({ length: card.punch_goal }, (_, index) => (
                    <span
                      key={index}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border text-[10px] font-semibold ${index < card.current_punches ? 'border-gold-300 bg-gold-400 text-graphite-950' : 'border-white/15 text-white/25'}`}
                    >
                      {index < card.current_punches ? '✓' : index + 1}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {(rewardsResult.data ?? []).length > 0 && (
        <section aria-labelledby="rewards-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="rewards-heading" className="text-base font-semibold text-white">
              Available rewards
            </h2>
            <Link href="/rewards/shop" className="text-xs text-gold-300">
              Browse all
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(rewardsResult.data ?? []).slice(0, 3).map((reward: any) => (
              <Link
                href={`/rewards/${reward.id}`}
                key={reward.id}
                className="group rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition hover:border-gold-400/30 active:scale-[0.98]"
              >
                <Gift className="h-5 w-5 text-gold-300" />
                <h3 className="mt-5 font-medium text-white">{reward.name}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-white/40">
                  {reward.description || 'Redeem this reward from your balance.'}
                </p>
                <p className="mt-4 text-sm font-semibold text-gold-300">
                  {Number(reward.points_cost).toLocaleString()} points
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(promotionsResult.data ?? []).length > 0 && (
        <section
          className="rounded-2xl border border-gold-400/20 bg-gold-400/[0.06] p-5"
          aria-labelledby="offers-heading"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gold-300" />
            <h2 id="offers-heading" className="font-medium text-white">
              Offers
            </h2>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(promotionsResult.data ?? []).map((offer: any) => (
              <div key={offer.id}>
                <p className="text-sm text-white">{offer.name}</p>
                <p className="mt-1 text-xs text-white/40">
                  Ends {new Date(offer.ends_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section
        id="wallet"
        className="grid gap-4 lg:grid-cols-[1fr_1.1fr]"
        aria-labelledby="wallet-heading"
      >
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <div className="flex items-center gap-2">
            <WalletCards className="h-5 w-5 text-gold-300" />
            <h2 id="wallet-heading" className="font-medium text-white">
              Digital rewards card
            </h2>
          </div>
          {qrDataUrl && membership ? (
            <div className="mt-5 flex items-center gap-5">
              <Image
                src={qrDataUrl}
                width={132}
                height={132}
                alt="Rewards membership QR code"
                className="rounded-xl bg-white p-2"
                unoptimized
              />
              <div>
                <p className="text-xs text-white/40">Membership</p>
                <p className="mt-1 font-mono text-sm text-white">{membership.membership_number}</p>
                <p className="mt-4 text-xs text-white/40">
                  Show this code to staff to find your rewards account.
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-white/45">
              Digital card setup is currently unavailable.
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <h2 className="font-medium text-white">Apple Wallet</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-white/45">
            Keep your points, tier, punch progress, and member QR code in Apple Wallet.
          </p>
          {program?.wallet_enabled && walletStatus.configured ? (
            <a
              href="/api/rewards/wallet/apple"
              className="mt-5 inline-flex active:scale-[0.98]"
              aria-label="Add rewards card to Apple Wallet"
            >
              <Image
                src="https://developer.apple.com/assets/elements/badges/add-to-apple-wallet/add-to-apple-wallet.svg"
                alt="Add to Apple Wallet"
                width={180}
                height={57}
                unoptimized
              />
            </a>
          ) : (
            <div className="mt-5 rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-xs text-white/45">
              Apple Wallet is currently unavailable.
            </div>
          )}
        </div>
      </section>

      {membership?.referral_code && (
        <section className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <Share2 className="mt-0.5 h-5 w-5 text-gold-300" />
            <div>
              <h2 className="font-medium text-white">Refer a friend</h2>
              <p className="mt-1 text-sm text-white/45">
                Share your code. Rewards are issued after they qualify.
              </p>
            </div>
          </div>
          <code className="rounded-lg border border-white/10 bg-black/20 px-4 py-2 text-sm text-white">
            {membership.referral_code}
          </code>
        </section>
      )}

      {(transactionsResult.data ?? []).length > 0 && (
        <section aria-labelledby="history-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="history-heading" className="text-base font-semibold text-white">
              Recent history
            </h2>
            <Link href="/rewards/history" className="text-xs text-gold-300">
              Full history
            </Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
            {(transactionsResult.data ?? []).slice(0, 5).map((transaction: any) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between gap-4 border-b border-white/8 px-5 py-4 last:border-0"
              >
                <div>
                  <p className="text-sm text-white">
                    {transaction.description ||
                      String(transaction.transaction_type).replaceAll('_', ' ')}
                  </p>
                  <p className="mt-1 text-xs text-white/35">
                    {new Date(transaction.created_at).toLocaleDateString()}
                  </p>
                </div>
                <p
                  className={`font-semibold tabular-nums ${transaction.points_delta > 0 ? 'text-emerald-400' : 'text-orange-300'}`}
                >
                  {transaction.points_delta > 0 ? '+' : ''}
                  {Number(transaction.points_delta).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
