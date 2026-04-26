export const dynamic = 'force-dynamic'

// app/sites/[tenant]/page.tsx — Public site homepage
import { notFound } from 'next/navigation'
import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import { SectionRenderer } from '@/components/site/SectionRenderer'

interface Props {
  params: Promise<{ tenant: string }>
}

export const revalidate = 60

export default async function SiteHomePage({ params }: Props) {
  const { tenant } = await params
  const tenantKey = decodeURIComponent(tenant)

  const siteData = tenantKey.includes('.')
    ? await getSiteByHost(tenantKey)
    : await getSiteBySlug(tenantKey)

  if (!siteData) notFound()

  const config = await getPublishedSiteConfig(siteData.tenant.id)
  if (!config) notFound()

  const homePage = config.pages.find((p) => p.page_type === 'home' || p.slug === '')
    ?? config.pages[0]

  if (!homePage) {
    return (
      <div style={{
        minHeight:      '60vh',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        textAlign:      'center',
        gap:            '1rem',
        padding:        '4rem 1.5rem',
        color:          'var(--color-muted)',
      }}>
        <p style={{ fontSize: '1.25rem', fontWeight: 600 }}>Welcome to {siteData.tenant.name}</p>
        <p style={{ fontSize: '0.9375rem' }}>Content coming soon.</p>
      </div>
    )
  }

  return (
    <div>
      {homePage.sections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          tenantId={siteData.tenant.id}
        />
      ))}
    </div>
  )
}
