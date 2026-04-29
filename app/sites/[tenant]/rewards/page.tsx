export const dynamic = 'force-dynamic'

// app/sites/[tenant]/rewards/page.tsx — Customer rewards & loyalty portal
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ tenant: string }>
}

type Transaction = {
  id: string
  transaction_type: string
  points_delta: number
  source_type: string | null
  created_at: string
  metadata: Record<string, unknown>
}

type PunchCard = {
  id: string
  title: string
  punch_goal: number
  current_punches: number
  reward_type: string
  reward_value: number | null
  status: string
}

const typeLabel: Record<string, string> = {
  earned:   'Points Earned',
  redeemed: 'Points Redeemed',
  adjusted: 'Adjustment',
  expired:  'Expired',
  bonus:    'Bonus Points',
}

const typeColor: Record<string, string> = {
  earned:   '#059669',
  redeemed: '#dc2626',
  adjusted: '#2563eb',
  expired:  '#6b7280',
  bonus:    '#7c3aed',
}

export default async function RewardsPage({ params }: Props) {
  const { tenant } = await params
  const tenantKey  = decodeURIComponent(tenant)

  const siteData = tenantKey.includes('.')
    ? await getSiteByHost(tenantKey)
    : await getSiteBySlug(tenantKey)

  if (!siteData) notFound()

  const config = await getPublishedSiteConfig(siteData.tenant.id)
  if (!config) notFound()

  const headersList = await headers()
  const isPlatform  = headersList.get('x-is-platform') === 'true'
  const basePath    = isPlatform ? `/sites/${tenant}` : ''
  const loginPath   = `${basePath}/login?next=/rewards`

  const sessionClient = await createSessionServerClient()
  const { data: { user } } = await sessionClient.auth.getUser()

  if (!user) redirect(loginPath)

  const db = getSupabaseServerClient()

  // Resolve the CRM customer_id via customer_accounts (multi-tenant safe)
  const { data: account } = await db
    .from('customer_accounts')
    .select('customer_id, status')
    .eq('auth_user_id', user.id)
    .eq('tenant_id', siteData.tenant.id)
    .maybeSingle()

  if (!account || account.status !== 'active') redirect(loginPath)

  const { customer_id: customerId } = account

  // Load all rewards data in parallel
  const [balanceResult, transactionsResult, punchCardsResult] = await Promise.all([
    db
      .from('rewards_balances')
      .select('points_balance, lifetime_points_earned, lifetime_points_redeemed')
      .eq('tenant_id', siteData.tenant.id)
      .eq('customer_id', customerId)
      .maybeSingle(),
    db
      .from('rewards_transactions')
      .select('id, transaction_type, points_delta, source_type, created_at, metadata')
      .eq('tenant_id', siteData.tenant.id)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20),
    db
      .from('reward_punch_cards')
      .select('id, title, punch_goal, current_punches, reward_type, reward_value, status')
      .eq('tenant_id', siteData.tenant.id)
      .eq('customer_id', customerId)
      .in('status', ['active', 'completed'])
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const balance      = balanceResult.data
  const transactions = (transactionsResult.data ?? []) as Transaction[]
  const punchCards   = (punchCardsResult.data   ?? []) as PunchCard[]

  const pointsBalance    = balance?.points_balance            ?? 0
  const lifetimeEarned   = balance?.lifetime_points_earned   ?? 0
  const lifetimeRedeemed = balance?.lifetime_points_redeemed ?? 0

  const card: React.CSSProperties = {
    background:   'var(--color-surface)',
    border:       '1px solid var(--color-border)',
    borderRadius: '1rem',
    padding:      '1.5rem',
  }

  return (
    <div style={{ minHeight: '60vh', padding: '3rem 1.5rem' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{
              fontSize:   'clamp(1.5rem, 3vw, 2rem)',
              fontWeight: 800,
              fontFamily: 'var(--font-heading)',
              color:      'var(--color-text)',
              margin:     0,
            }}>Rewards</h1>
            <p style={{ color: 'var(--color-muted)', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
              Earn points on every purchase
            </p>
          </div>
          <Link href={`${basePath}/account`} style={{
            fontSize: '0.875rem', color: 'var(--color-muted)', textDecoration: 'none',
          }}>
            ← Account
          </Link>
        </div>

        {/* Balance overview */}
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: '2rem' }}>
          <div style={{
            ...card,
            background:  'var(--color-primary)',
            border:      'none',
            textAlign:   'center',
          }}>
            <p style={{ fontSize: '2.5rem', fontWeight: 800, color: '#fff', margin: 0, lineHeight: 1 }}>
              {pointsBalance.toLocaleString()}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.875rem', margin: '0.5rem 0 0', fontWeight: 600 }}>
              Available Points
            </p>
          </div>

          <div style={{ ...card, textAlign: 'center' }}>
            <p style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text)', margin: 0, lineHeight: 1 }}>
              {lifetimeEarned.toLocaleString()}
            </p>
            <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
              Total Earned
            </p>
          </div>

          <div style={{ ...card, textAlign: 'center' }}>
            <p style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text)', margin: 0, lineHeight: 1 }}>
              {lifetimeRedeemed.toLocaleString()}
            </p>
            <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
              Total Redeemed
            </p>
          </div>
        </div>

        {/* Punch cards */}
        {punchCards.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 1rem' }}>
              Punch Cards
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {punchCards.map((pc) => {
                const progress = Math.min(1, pc.current_punches / pc.punch_goal)
                const pct      = Math.round(progress * 100)
                return (
                  <div key={pc.id} style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)', fontSize: '0.9375rem' }}>
                          {pc.title}
                        </p>
                        <p style={{ margin: '0.125rem 0 0', fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
                          {pc.current_punches} / {pc.punch_goal} punches
                        </p>
                      </div>
                      {pc.status === 'completed' && (
                        <span style={{
                          background: '#dcfce7', color: '#15803d',
                          padding: '0.25rem 0.625rem', borderRadius: '99px',
                          fontSize: '0.75rem', fontWeight: 700,
                        }}>
                          Completed ✓
                        </span>
                      )}
                    </div>
                    {/* Progress bar */}
                    <div style={{
                      background: 'var(--color-border)', borderRadius: '99px',
                      height: 8, overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: pc.status === 'completed' ? '#059669' : 'var(--color-primary)',
                        borderRadius: '99px',
                        transition: 'width 0.4s ease',
                      }} />
                    </div>

                    {/* Punch dots */}
                    <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                      {Array.from({ length: pc.punch_goal }).map((_, i) => (
                        <div
                          key={i}
                          style={{
                            width:        20,
                            height:       20,
                            borderRadius: '50%',
                            background:   i < pc.current_punches ? 'var(--color-primary)' : 'var(--color-border)',
                            border:       `2px solid ${i < pc.current_punches ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            transition:   'background 0.2s',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Transaction history */}
        <div>
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 1rem' }}>
            Points History
          </h2>

          {transactions.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--color-muted)' }}>
              <p style={{ margin: 0 }}>No transactions yet.</p>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
                Start shopping to earn points!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {transactions.map((tx) => (
                <div key={tx.id} style={{
                  ...card,
                  padding:        '1rem 1.25rem',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'space-between',
                  gap:            '1rem',
                  flexWrap:       'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)', fontSize: '0.875rem' }}>
                      {typeLabel[tx.transaction_type] ?? tx.transaction_type}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                      {new Date(tx.created_at).toLocaleDateString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                      {tx.source_type ? ` · ${tx.source_type}` : ''}
                    </p>
                  </div>
                  <span style={{
                    fontWeight:  700,
                    fontSize:    '0.9375rem',
                    color:       typeColor[tx.transaction_type] ?? 'var(--color-text)',
                    whiteSpace:  'nowrap',
                  }}>
                    {tx.points_delta > 0 ? '+' : ''}{tx.points_delta.toLocaleString()} pts
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Shop CTA */}
        <div style={{ marginTop: '2.5rem', textAlign: 'center' }}>
          <Link href={`${basePath}/shop`} style={{
            display:        'inline-block',
            background:     'var(--color-primary)',
            color:          '#fff',
            padding:        '0.875rem 2.5rem',
            borderRadius:   '0.875rem',
            fontWeight:     700,
            textDecoration: 'none',
            fontSize:       '0.9375rem',
          }}>
            Shop & Earn More Points →
          </Link>
        </div>
      </div>
    </div>
  )
}
