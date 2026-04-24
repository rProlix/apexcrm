// app/sites/[tenant]/orders/page.tsx — Customer order history
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'

interface Props {
  params: { tenant: string }
}

export default async function OrdersPage({ params }: Props) {
  const tenantKey = decodeURIComponent(params.tenant)

  const siteData = tenantKey.includes('.')
    ? await getSiteByHost(tenantKey)
    : await getSiteBySlug(tenantKey)

  if (!siteData) notFound()

  const config = await getPublishedSiteConfig(siteData.tenant.id)
  if (!config) notFound()

  const sessionClient = createSessionServerClient()
  const { data: { user } } = await sessionClient.auth.getUser()

  if (!user) redirect('/login?next=/orders')

  const db = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ordersRaw } = await (db as any)
    .from('orders')
    .select('id, status, total_amount, created_at, items')
    .eq('tenant_id', siteData.tenant.id)
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const orders = (ordersRaw ?? []) as Array<{
    id: string; status: string; total_amount: number | null
    created_at: string; items?: unknown[]
  }>

  const statusColors: Record<string, string> = {
    pending:   '#d97706',
    paid:      '#059669',
    shipped:   '#2563eb',
    delivered: '#059669',
    cancelled: '#dc2626',
  }

  return (
    <div style={{ minHeight: '60vh', padding: '3rem 1.5rem' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <h1 style={{
            fontSize:   'clamp(1.5rem, 3vw, 2rem)',
            fontWeight: 700,
            fontFamily: 'var(--font-heading)',
            color:      'var(--color-text)',
            margin:     0,
          }}>Order History</h1>
          <Link href="/account" style={{
            fontSize:       '0.875rem',
            color:          'var(--color-muted)',
            textDecoration: 'none',
          }}>← Account</Link>
        </div>

        {(!orders || orders.length === 0) ? (
          <div style={{
            textAlign:  'center',
            padding:    '4rem 1.5rem',
            color:      'var(--color-muted)',
          }}>
            <p style={{ fontSize: '1.125rem', marginBottom: '1.5rem' }}>No orders yet.</p>
            <Link href="/shop" style={{
              display:        'inline-block',
              background:     'var(--color-primary)',
              color:          '#fff',
              padding:        '0.75rem 1.75rem',
              borderRadius:   '0.75rem',
              fontWeight:     600,
              textDecoration: 'none',
            }}>
              Start Shopping
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {orders.map((order) => (
              <div key={order.id} style={{
                background:   'var(--color-surface)',
                border:       '1px solid var(--color-border)',
                borderRadius: '0.875rem',
                padding:      '1.25rem 1.5rem',
                display:      'flex',
                alignItems:   'center',
                gap:          '1rem',
                flexWrap:     'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin:     0,
                    fontWeight: 600,
                    color:      'var(--color-text)',
                    fontSize:   '0.9375rem',
                    overflow:   'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    Order #{order.id.slice(0, 8).toUpperCase()}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
                    {new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{
                    fontSize:     '0.75rem',
                    fontWeight:   600,
                    padding:      '0.25rem 0.75rem',
                    borderRadius: '99px',
                    background:   `${statusColors[order.status] ?? '#6b7280'}22`,
                    color:        statusColors[order.status] ?? '#6b7280',
                  }}>
                    {order.status}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                    ${Number(order.total_amount).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
