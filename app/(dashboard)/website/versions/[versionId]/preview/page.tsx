// app/(dashboard)/website/versions/[versionId]/preview/page.tsx
//
// Renders a read-only preview of a historical website version.
//
// IMPORTANT: Renders ONLY from website_versions.snapshot.
// Does NOT read current site_sections or site_pages tables.
// Does NOT mutate any data.

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getWebsiteVersion } from '@/lib/website/versioning'
import { SafeSectionRenderer } from '@/components/site/SafeSectionRenderer'
import { VersionPreviewActions } from '@/components/builder/VersionPreviewActions'
import type { WebsiteSnapshotSection, WebsiteSnapshotPage } from '@/lib/website/versionTypes'

interface Props {
  params:       Promise<{ versionId: string }>
  searchParams: Promise<{ page?: string }>
}

const SOURCE_LABELS: Record<string, string> = {
  manual:       'Manual checkpoint',
  autosave:     'Autosave',
  ai_autofill:  'AI Autofill',
  ai_images:    'AI Images',
  restore:      'Restore',
  publish:      'Publish',
  drag_drop:    'Drag & Drop',
  section_edit: 'Section Edit',
}

export default async function VersionPreviewPage({ params, searchParams }: Props) {
  const { versionId } = await params
  const { page: pageSlugParam } = await searchParams

  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) redirect('/login')
  if (!ctx.tenant_id) redirect('/dashboard')

  // Load the version — reads snapshot, NOT live tables
  const result = await getWebsiteVersion(ctx.tenant_id, versionId)
  if (!result.data) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
        <p style={{ color: '#ef4444', fontWeight: 600 }}>Version not found or access denied.</p>
        <a href="/website/versions" style={{ color: '#c9a84c', marginTop: '1rem', display: 'inline-block' }}>
          ← Back to Version History
        </a>
      </div>
    )
  }

  const version  = result.data
  const snapshot = version.snapshot

  // Validate snapshot has real data
  const pages = snapshot?.pages ?? []
  if (!snapshot || pages.length === 0) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📭</div>
        <p style={{ color: '#f59e0b', fontWeight: 600 }}>
          Version #{version.version_number} has an empty snapshot.
        </p>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.5rem' }}>
          This version was created before full snapshot capture was implemented.
        </p>
        <a href="/website/versions" style={{ color: '#c9a84c', marginTop: '1rem', display: 'inline-block' }}>
          ← Back to Version History
        </a>
      </div>
    )
  }

  // Resolve which page to show from the snapshot (NOT from DB)
  const activePage: WebsiteSnapshotPage | undefined = pageSlugParam
    ? pages.find((p) =>
        p.slug === pageSlugParam ||
        p.slug === `/${pageSlugParam}` ||
        p.slug.replace(/^\//, '') === pageSlugParam,
      )
    : pages.find((p) => p.page_type === 'home' || p.slug === '' || p.slug === '/')
      ?? pages[0]

  // Sort sections by sort_order — use snapshot sort_order exactly as saved
  const sections: WebsiteSnapshotSection[] = (activePage?.sections ?? [])
    .filter((s) => s.is_visible)
    .sort((a, b) => a.sort_order - b.sort_order)

  const totalSections = pages.reduce((sum, p) => sum + p.sections.length, 0)

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* ── Preview Banner ────────────────────────────────────────────────── */}
      <div style={{
        position:    'fixed',
        top:         0,
        left:        0,
        right:       0,
        zIndex:      99999,
        background:  '#0f0f13',
        borderBottom: '2px solid #c9a84c44',
        padding:     '0.625rem 1.25rem',
        display:     'flex',
        alignItems:  'center',
        gap:         '0.75rem',
        flexWrap:    'wrap',
      }}>
        {/* Version info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <span style={{
            background:  '#c9a84c22',
            border:      '1px solid #c9a84c44',
            color:       '#c9a84c',
            fontSize:    '0.75rem',
            fontWeight:  700,
            padding:     '0.2rem 0.5rem',
            borderRadius: '0.375rem',
          }}>
            Preview
          </span>
          <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: '0.875rem' }}>
            Version #{version.version_number}
            {version.label ? ` — ${version.label}` : ''}
          </span>
        </div>

        {/* Metadata badges */}
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.6875rem', color: '#9ca3af', background: '#1f1f27', padding: '0.15rem 0.5rem', borderRadius: '0.25rem' }}>
            {new Date(version.created_at).toLocaleString()}
          </span>
          <span style={{ fontSize: '0.6875rem', color: '#9ca3af', background: '#1f1f27', padding: '0.15rem 0.5rem', borderRadius: '0.25rem' }}>
            {SOURCE_LABELS[version.source] ?? version.source}
          </span>
          <span style={{ fontSize: '0.6875rem', color: '#9ca3af', background: '#1f1f27', padding: '0.15rem 0.5rem', borderRadius: '0.25rem' }}>
            {pages.length}p / {totalSections}s
          </span>
        </div>

        <span style={{ color: '#f59e0b', fontSize: '0.75rem', fontWeight: 600 }}>
          ⚠ Not live
        </span>

        <div style={{ flex: 1 }} />

        {/* Action buttons (client component) */}
        <VersionPreviewActions
          versionId={versionId}
          versionNumber={version.version_number}
        />

        <a
          href="/website/versions"
          style={{
            padding:      '0.375rem 0.75rem',
            borderRadius: '0.5rem',
            border:       '1px solid #3f3f46',
            color:        '#9ca3af',
            textDecoration: 'none',
            fontSize:     '0.8125rem',
            fontWeight:   600,
            whiteSpace:   'nowrap',
          }}
        >
          ← Back
        </a>
      </div>

      {/* ── Page tab bar (multiple pages) ─────────────────────────────────── */}
      {pages.length > 1 && (
        <div style={{
          position:    'fixed',
          top:         48,
          left:        0,
          right:       0,
          zIndex:      99998,
          background:  '#111115',
          borderBottom: '1px solid #2e2e38',
          display:     'flex',
          gap:         '0.25rem',
          padding:     '0.375rem 1.25rem',
          overflowX:   'auto',
        }}>
          {pages.map((p) => {
            const slugParam = p.slug.replace(/^\//, '') || ''
            return (
              <a
                key={p.id}
                href={`/website/versions/${versionId}/preview${slugParam ? `?page=${slugParam}` : ''}`}
                style={{
                  padding:     '0.25rem 0.75rem',
                  borderRadius: '0.375rem',
                  fontSize:    '0.8125rem',
                  color:       activePage?.id === p.id ? '#c9a84c' : '#9ca3af',
                  background:  activePage?.id === p.id ? '#c9a84c1a' : 'transparent',
                  textDecoration: 'none',
                  fontWeight:  activePage?.id === p.id ? 700 : 400,
                  whiteSpace:  'nowrap',
                  flexShrink:  0,
                }}
              >
                {p.title ?? p.slug}
              </a>
            )
          })}
        </div>
      )}

      {/* ── Snapshot sections ─────────────────────────────────────────────── */}
      <div style={{ paddingTop: pages.length > 1 ? 88 : 52 }}>
        {sections.length === 0 ? (
          <div style={{
            minHeight:  '40vh',
            display:    'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color:      '#6b7280',
            gap:        '0.5rem',
          }}>
            <div style={{ fontSize: '2rem' }}>📭</div>
            <p>No visible sections in this snapshot.</p>
            {activePage && (
              <p style={{ fontSize: '0.8125rem' }}>
                Page: {activePage.title ?? activePage.slug} ({activePage.sections.length} total sections)
              </p>
            )}
          </div>
        ) : (
          // Render directly from snapshot data — NOT from current DB tables
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
              mode="preview"
            />
          ))
        )}
      </div>
    </div>
  )
}
