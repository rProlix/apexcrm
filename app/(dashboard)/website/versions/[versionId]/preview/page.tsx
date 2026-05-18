// app/(dashboard)/website/versions/[versionId]/preview/page.tsx
// Renders a read-only preview of a historical website version.
// Auth required; tenant-safe. Does NOT mutate live website data.

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getWebsiteVersion } from '@/lib/website/versioning'
import { SafeSectionRenderer } from '@/components/site/SafeSectionRenderer'
import type { WebsiteSnapshotSection, WebsiteSnapshotPage } from '@/lib/website/versionTypes'

interface Props {
  params: Promise<{ versionId: string }>
  searchParams: Promise<{ page?: string }>
}

export default async function VersionPreviewPage({ params, searchParams }: Props) {
  const { versionId } = await params
  const { page: pageSlug } = await searchParams

  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) {
    redirect('/login')
  }
  if (!ctx.tenant_id) redirect('/dashboard')

  const result = await getWebsiteVersion(ctx.tenant_id, versionId)
  if (!result.data) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <p style={{ color: '#ef4444' }}>Version not found or access denied.</p>
        <a href="/website/versions" style={{ color: '#c9a84c' }}>← Back to Version History</a>
      </div>
    )
  }

  const version  = result.data
  const snapshot = version.snapshot
  const pages    = snapshot.pages ?? []

  // Resolve which page to show
  const activePage: WebsiteSnapshotPage | undefined = pageSlug
    ? pages.find((p) => p.slug === pageSlug || p.slug === `/${pageSlug}`)
    : pages.find((p) => p.page_type === 'home' || p.slug === '' || p.slug === '/')
      ?? pages[0]

  const sections: WebsiteSnapshotSection[] = (activePage?.sections ?? [])
    .filter((s) => s.is_visible)
    .sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Preview Banner */}
      <div style={{
        position:    'fixed',
        top:         0,
        left:        0,
        right:       0,
        zIndex:      99999,
        background:  '#1a1a1f',
        borderBottom: '1px solid #c9a84c44',
        padding:     '0.75rem 1.5rem',
        display:     'flex',
        alignItems:  'center',
        gap:         '1rem',
        flexWrap:    'wrap',
      }}>
        <span style={{ color: '#c9a84c', fontWeight: 700, fontSize: '0.875rem' }}>
          👁 Previewing Version #{version.version_number}
          {version.label ? ` — ${version.label}` : ''}
        </span>
        <span style={{
          fontSize:    '0.75rem',
          color:       '#6b7280',
          background:  '#2e2e38',
          padding:     '0.125rem 0.5rem',
          borderRadius: '0.25rem',
        }}>
          {new Date(version.created_at).toLocaleString()}
        </span>
        <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>
          This is not live. Viewing historical snapshot only.
        </span>
        <div style={{ flex: 1 }} />
        <form action={`/api/website/versions/${versionId}/restore`} method="POST">
          <button
            type="submit"
            style={{
              padding:     '0.375rem 0.875rem',
              borderRadius: '0.5rem',
              border:      '1px solid #6b7280',
              background:  'transparent',
              color:       '#d1d5db',
              cursor:      'pointer',
              fontSize:    '0.8125rem',
              fontWeight:  600,
            }}
          >
            Restore this version
          </button>
        </form>
        <form action={`/api/website/versions/${versionId}/publish`} method="POST">
          <button
            type="submit"
            style={{
              padding:     '0.375rem 0.875rem',
              borderRadius: '0.5rem',
              border:      'none',
              background:  '#16a34a',
              color:       '#fff',
              cursor:      'pointer',
              fontSize:    '0.8125rem',
              fontWeight:  600,
            }}
          >
            Publish this version
          </button>
        </form>
        <a
          href="/website/versions"
          style={{
            padding:     '0.375rem 0.875rem',
            borderRadius: '0.5rem',
            border:      '1px solid #3f3f46',
            color:       '#9ca3af',
            textDecoration: 'none',
            fontSize:    '0.8125rem',
            fontWeight:  600,
          }}
        >
          ← Back
        </a>
      </div>

      {/* Page tab bar if multiple pages */}
      {pages.length > 1 && (
        <div style={{
          position:    'fixed',
          top:         48,
          left:        0,
          right:       0,
          zIndex:      99998,
          background:  '#111114',
          borderBottom: '1px solid #2e2e38',
          display:     'flex',
          gap:         '0.25rem',
          padding:     '0.5rem 1.5rem',
          overflowX:   'auto',
        }}>
          {pages.map((p) => (
            <a
              key={p.id}
              href={`/website/versions/${versionId}/preview?page=${p.slug.replace(/^\//, '') || ''}`}
              style={{
                padding:     '0.25rem 0.75rem',
                borderRadius: '0.375rem',
                fontSize:    '0.8125rem',
                color:       activePage?.id === p.id ? '#c9a84c' : '#9ca3af',
                background:  activePage?.id === p.id ? '#c9a84c22' : 'transparent',
                textDecoration: 'none',
                fontWeight:  activePage?.id === p.id ? 700 : 400,
                whiteSpace:  'nowrap',
              }}
            >
              {p.title ?? p.slug}
            </a>
          ))}
        </div>
      )}

      {/* Page content */}
      <div style={{ paddingTop: pages.length > 1 ? 96 : 56 }}>
        {sections.length === 0 ? (
          <div style={{
            minHeight:  '40vh',
            display:    'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6b7280',
          }}>
            No visible sections in this version.
          </div>
        ) : (
          sections.map((section, index) => (
            <SafeSectionRenderer
              key={`${section.id}-${index}`}
              section={{
                id:               section.id,
                tenant_id:        ctx.tenant_id!,
                page_id:          activePage?.id ?? '',
                section_type:     section.section_type,
                section_key:      section.section_key,
                content:          section.content,
                sort_order:       section.sort_order,
                is_visible:       section.is_visible,
                animation_config: section.animation_config,
                style_config:     section.style_config,
                created_at:       section.created_at,
                updated_at:       section.updated_at,
              }}
              tenantId={ctx.tenant_id!}
              index={index}
              mode="public"
            />
          ))
        )}
      </div>
    </div>
  )
}
