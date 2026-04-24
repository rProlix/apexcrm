// app/sites/[tenant]/[...slug]/page.tsx
// Catch-all for custom pages: /about, /contact, /faq, and any custom slug.
import { notFound } from 'next/navigation'
import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import { SectionRenderer } from '@/components/site/SectionRenderer'

interface Props {
  params: { tenant: string; slug: string[] }
}

export const revalidate = 60

export default async function CustomPage({ params }: Props) {
  const tenantKey = decodeURIComponent(params.tenant)
  const pageSlug  = params.slug.join('/')

  const siteData = tenantKey.includes('.')
    ? await getSiteByHost(tenantKey)
    : await getSiteBySlug(tenantKey)

  if (!siteData) notFound()

  const config = await getPublishedSiteConfig(siteData.tenant.id)
  if (!config) notFound()

  const page = config.pages.find((p) => p.slug === pageSlug || p.slug === `/${pageSlug}`)
  if (!page) notFound()

  return (
    <div>
      {page.sections.length > 0 ? (
        page.sections.map((section) => (
          <SectionRenderer
            key={section.id}
            section={section}
            tenantId={siteData.tenant.id}
          />
        ))
      ) : (
        <div style={{
          minHeight:      '40vh',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        '4rem 1.5rem',
        }}>
          <div style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
            <h1 style={{
              fontSize:   'clamp(1.5rem, 3vw, 2rem)',
              fontWeight: 700,
              color:      'var(--color-text)',
              fontFamily: 'var(--font-heading)',
              marginBottom: '0.5rem',
            }}>
              {page.title || pageSlug}
            </h1>
            <p>This page has no content yet.</p>
          </div>
        </div>
      )}
    </div>
  )
}
