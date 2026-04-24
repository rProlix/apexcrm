// app/preview/[tenantId]/page.tsx
// Admin-only preview of the public website using draft content.
// Accessible at /preview/{tenantId} on the platform domain.
// Requires owner or admin role — customers cannot access this.

import { notFound, redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { getDraftSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import { normalizeTheme } from '@/lib/website/normalizeTheme'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'
import { SectionRenderer } from '@/components/site/SectionRenderer'

interface Props {
  params: Promise<{ tenantId: string }>
}

export const metadata = { title: 'Site Preview' }

export default async function PreviewPage({ params }: Props) {
  const { tenantId } = await params
  // Enforce admin / owner access — customers cannot preview
  let ctx: Awaited<ReturnType<typeof requireRole>>
  try {
    ctx = await requireRole(['owner', 'admin'])
  } catch {
    redirect('/login?next=/preview/' + tenantId)
  }

  // An admin can only preview their own tenant's site unless they're the platform owner
  const isOwner = ctx!.role === 'owner'
  if (!isOwner && ctx!.tenant_id !== tenantId) {
    notFound()
  }

  const config = await getDraftSiteConfig(tenantId)
  if (!config) notFound()

  const theme   = normalizeTheme(config.settings)
  const cssVars = {
    '--color-primary':  theme.primaryColor,
    '--color-accent':   theme.accentColor,
    '--color-bg':       theme.backgroundColor,
    '--color-surface':  theme.surfaceColor,
    '--color-text':     theme.textColor,
    '--color-muted':    theme.mutedColor,
    '--color-border':   theme.borderColor,
    '--font-heading':   `"${theme.fontHeading}", sans-serif`,
    '--font-body':      `"${theme.fontBody}", sans-serif`,
  } as React.CSSProperties

  const homePage = config.pages.find((p) => p.page_type === 'home' || p.slug === '')
    ?? config.pages[0]

  return (
    <div
      style={{
        ...cssVars,
        background: theme.backgroundColor,
        color:      theme.textColor,
        fontFamily: `"${theme.fontBody}", sans-serif`,
        minHeight:  '100vh',
      }}
    >
      {/* Preview banner */}
      <div style={{
        background:     '#f59e0b',
        color:          '#000',
        textAlign:      'center',
        padding:        '0.625rem 1rem',
        fontSize:       '0.8125rem',
        fontWeight:     600,
        position:       'sticky',
        top:            0,
        zIndex:         100,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '0.75rem',
      }}>
        <span>⚠️ Preview Mode — Draft content. Not visible to the public.</span>
        <a
          href={`/website/pages`}
          style={{
            background:     '#000',
            color:          '#f59e0b',
            padding:        '0.25rem 0.75rem',
            borderRadius:   '99px',
            fontSize:       '0.75rem',
            fontWeight:     700,
            textDecoration: 'none',
          }}
        >
          Back to Editor
        </a>
      </div>

      <SiteHeader config={config} />

      <main>
        {homePage?.sections.map((section) => (
          <SectionRenderer
            key={section.id}
            section={section}
            tenantId={tenantId}
          />
        ))}

        {(!homePage || homePage.sections.length === 0) && (
          <div style={{
            textAlign:  'center',
            padding:    '5rem 1.5rem',
            color:      'var(--color-muted)',
          }}>
            <p style={{ fontSize: '1.125rem' }}>No published sections yet. Add sections in the editor.</p>
          </div>
        )}
      </main>

      <SiteFooter config={config} />
    </div>
  )
}
