export const dynamic = 'force-dynamic'
export const revalidate = 60

// app/sites/[tenant]/[[...slug]]/page.tsx
// Optional catch-all — handles both the tenant homepage (no slug) and all
// nested custom pages (/about, /contact, /faq, etc.) in a single component.

import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import { SectionRenderer } from '@/components/site/SectionRenderer'

interface Props {
  params: Promise<{ tenant: string; slug?: string[] }>
}

export default async function TenantPage({ params }: Props) {
  const { tenant, slug } = await params
  const tenantKey = decodeURIComponent(tenant)
  // Empty string → home page; joined string → custom page slug
  const pageSlug = slug?.join('/') ?? ''

  // Resolve site — custom domain uses host-based lookup, slug uses subdomain
  const siteData = tenantKey.includes('.')
    ? await getSiteByHost(tenantKey)
    : await getSiteBySlug(tenantKey)

  if (!siteData) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', textAlign: 'center', padding: '4rem 1.5rem',
      }}>
        <p style={{ color: 'var(--color-muted)', fontSize: '1rem' }}>
          Site not found.
        </p>
      </div>
    )
  }

  const config = await getPublishedSiteConfig(siteData.tenant.id)

  if (!config) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        gap: '1rem', padding: '4rem 1.5rem',
      }}>
        <p style={{ fontSize: '1.25rem', fontWeight: 600 }}>
          Welcome to {siteData.tenant.name}
        </p>
        <p style={{ fontSize: '0.9375rem', color: 'var(--color-muted)' }}>
          This site is coming soon.
        </p>
      </div>
    )
  }

  // Home page: find the page marked as home, slug '', or fall back to first page
  const page = pageSlug === ''
    ? (config.pages.find((p) => p.page_type === 'home' || p.slug === '') ?? config.pages[0])
    : config.pages.find((p) => p.slug === pageSlug || p.slug === `/${pageSlug}`)

  if (!page) {
    return (
      <div style={{
        minHeight: '40vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '4rem 1.5rem',
      }}>
        <div style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
          <h1 style={{
            fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 700,
            color: 'var(--color-text)', fontFamily: 'var(--font-heading)',
            marginBottom: '0.5rem',
          }}>
            {pageSlug === '' ? `Welcome to ${siteData.tenant.name}` : 'Page not found'}
          </h1>
          <p>
            {pageSlug === '' ? 'Content coming soon.' : 'This page does not exist on this site.'}
          </p>
        </div>
      </div>
    )
  }

  if (page.sections.length === 0) {
    return (
      <div style={{
        minHeight: '40vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '4rem 1.5rem',
      }}>
        <div style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
          <h1 style={{
            fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 700,
            color: 'var(--color-text)', fontFamily: 'var(--font-heading)',
            marginBottom: '0.5rem',
          }}>
            {page.title || siteData.tenant.name}
          </h1>
          <p>This page has no content yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {page.sections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          tenantId={siteData.tenant.id}
        />
      ))}
    </div>
  )
}
