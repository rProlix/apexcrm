export const dynamic  = 'force-dynamic'
export const revalidate = 0

// app/sites/[tenant]/[[...slug]]/page.tsx
//
// Public storefront catch-all page. Handles:
//   - /sites/[tenant]              → home page
//   - /sites/[tenant]/about        → page by slug
//   - Subdomain rewrites (via middleware)
//
// Rendering modes:
//   EDITOR  (owner/admin)  → EditorShell client component with draft+published sections
//   PUBLIC  (everyone else) → SafeSectionRenderer server-side, zero JS for visitors
//
// Zero-404 guarantee: unknown slugs fall back to the homepage silently.

import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig, getDraftSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import { SafeSectionRenderer } from '@/components/site/SafeSectionRenderer'
import { TemplateRenderer } from '@/components/site/TemplateRenderer'
import { getUserContext } from '@/lib/auth/getUserContext'
import { normalizeSection, isPublicVisible, bySortOrder } from '@/lib/website/normalizeWebsiteSection'
import type { BuilderSection, EditorContext } from '@/lib/builder/types'
// EditorShellClient is a 'use client' boundary that holds the ssr:false dynamic import.
// Importing it here is safe — server components CAN import client components.
import { EditorShellClient } from '@/components/builder/EditorShellClient'

interface Props {
  params: Promise<{ tenant: string; slug?: string[] }>
}

export default async function TenantPage({ params }: Props) {
  const { tenant, slug } = await params
  const tenantKey  = decodeURIComponent(tenant)
  const pathSlug   = slug?.join('/') ?? ''

  // ── 1. Resolve tenant ──────────────────────────────────────────────────────
  let siteData: Awaited<ReturnType<typeof getSiteBySlug>> = null
  try {
    siteData = tenantKey.includes('.')
      ? await getSiteByHost(tenantKey)
      : await getSiteBySlug(tenantKey)
  } catch (err) {
    console.error('[TenantPage] getSiteBy* failed for', tenantKey, err instanceof Error ? err.message : err)
  }

  if (!siteData) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', textAlign: 'center', padding: '4rem 1.5rem',
      }}>
        <p style={{ color: 'var(--color-muted)', fontSize: '1rem' }}>Site not found.</p>
      </div>
    )
  }

  const tenantId = siteData.tenant.id

  // ── 2. Check editor access (server-side only — never trust client) ─────────
  let isEditor = false
  try {
    const ctx = await getUserContext()
    if (ctx && ['owner', 'admin'].includes(ctx.role)) {
      isEditor = ctx.role === 'owner' || ctx.tenant_id === tenantId
    }
  } catch {
    // Supabase unavailable — fall through to public mode
  }

  // ── 3. Load site config ────────────────────────────────────────────────────
  // Editors see draft content; public visitors see only published content.
  let config: Awaited<ReturnType<typeof getPublishedSiteConfig>> = null
  try {
    config = isEditor
      ? await getDraftSiteConfig(tenantId)
      : await getPublishedSiteConfig(tenantId)
  } catch (err) {
    console.error('[TenantPage] getConfig failed for tenant', tenantId, err instanceof Error ? err.message : err)
  }

  // Site has no content yet
  if (!config) {
    if (isEditor) {
      // Editor with no pages: offer a bootstrap/empty state with the builder
      return (
        <div style={{
          minHeight: '60vh', display: 'flex', flexDirection: 'column', gap: '1.5rem',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          padding: '4rem 1.5rem',
        }}>
          <div style={{ fontSize: '2.5rem' }}>🏗️</div>
          <p style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text)' }}>
            No pages found for {siteData.tenant.name}
          </p>
          <p style={{ color: 'var(--color-muted)', maxWidth: 400 }}>
            Create a page in the website builder, then come back here.
          </p>
          <a href="/website/pages" style={{
            padding: '0.625rem 1.5rem', background: 'var(--color-primary)', color: '#fff',
            borderRadius: '0.5rem', textDecoration: 'none', fontWeight: 600, fontSize: '0.9375rem',
          }}>Open Website Builder</a>
        </div>
      )
    }

    return (
      <div style={{
        minHeight: '60vh', display: 'flex', flexDirection: 'column', gap: '1rem',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        padding: '4rem 1.5rem',
      }}>
        <p style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text)' }}>
          Welcome to {siteData.tenant.name}
        </p>
        <p style={{ fontSize: '0.9375rem', color: 'var(--color-muted)' }}>
          This site is coming soon.
        </p>
      </div>
    )
  }

  // ── 4. Resolve page ────────────────────────────────────────────────────────
  let page = pathSlug === ''
    ? (config.pages.find((p) => p.page_type === 'home' || p.slug === '') ?? config.pages[0])
    : config.pages.find((p) =>
        p.slug === pathSlug ||
        p.slug === `/${pathSlug}` ||
        p.slug.replace(/^\//, '') === pathSlug,
      )

  // Zero-404 guarantee: unknown slug → homepage
  if (!page) {
    page = config.pages.find((p) => p.page_type === 'home' || p.slug === '') ?? config.pages[0]
  }

  // ── 5. EDITOR MODE ─────────────────────────────────────────────────────────
  if (isEditor && page) {
    console.log(
      `[TenantPage] EDITOR mode — tenant=${tenantId} page=${page.id} slug="${page.slug}" sections=${page.sections.length}`,
    )
    const editorCtx: EditorContext = {
      tenantId,
      pageId:      page.id,
      pageName:    page.title ?? (page.page_type === 'home' ? 'Home' : page.slug),
      pageSlug:    page.slug,
      isPublished: config.settings.is_published,
      sections:    page.sections as BuilderSection[],
    }
    return <EditorShellClient editorCtx={editorCtx} />
  }

  // ── 6. PUBLIC MODE ─────────────────────────────────────────────────────────
  if (!page) {
    return (
      <div style={{
        minHeight: '40vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '4rem 1.5rem', textAlign: 'center',
      }}>
        <div>
          <h1 style={{
            fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 700,
            color: 'var(--color-text)', fontFamily: 'var(--font-heading)', marginBottom: '0.5rem',
          }}>
            {siteData.tenant.name}
          </h1>
          <p style={{ color: 'var(--color-muted)' }}>Content coming soon.</p>
        </div>
      </div>
    )
  }

  // Normalize and filter sections — the safe pipeline that never crashes
  const sections = (page.sections ?? [])
    .map((raw) => {
      try { return normalizeSection(raw) }
      catch { return null }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .filter((s) => isPublicVisible(s))
    .sort(bySortOrder)

  console.log(
    `[TenantPage] PUBLIC — tenant=${tenantId} page=${page.id} slug="${page.slug}" ` +
    `rawSections=${page.sections.length} visibleSections=${sections.length} ` +
    `types=${sections.map((s) => s!.type).join(',')}`,
  )

  if (sections.length === 0) {
    return (
      <div style={{
        minHeight: '40vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '4rem 1.5rem', textAlign: 'center',
      }}>
        <div>
          <h1 style={{
            fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 700,
            color: 'var(--color-text)', fontFamily: 'var(--font-heading)', marginBottom: '0.5rem',
          }}>
            {page.title || siteData.tenant.name}
          </h1>
          <p style={{ color: 'var(--color-muted)' }}>
            {config.settings.is_published ? 'No sections yet.' : 'This page is coming soon.'}
          </p>
        </div>
      </div>
    )
  }

  // Detect active template from site settings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settingsRaw = config.settings as unknown as Record<string, unknown>
  const activeTemplateKey = (settingsRaw.active_template_key as string | null | undefined) ?? null
  const templateConfig    = (settingsRaw.template_config as Record<string, unknown> | null | undefined) ?? {}

  // If an active template is set, route through TemplateRenderer for premium layout
  if (activeTemplateKey) {
    return (
      <TemplateRenderer
        activeTemplateKey={activeTemplateKey}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sections={sections.map((s) => s!.raw as any)}
        tenantId={tenantId}
        mode="public"
        templateConfig={templateConfig}
      />
    )
  }

  // Default: standard section-by-section rendering
  return (
    <div>
      {await Promise.all(
        sections.map(async (section, index) => (
          <SafeSectionRenderer
            key={`${section!.id}-${index}`}
            section={section!.raw}
            tenantId={tenantId}
            index={index}
            mode="public"
          />
        )),
      )}
    </div>
  )
}
