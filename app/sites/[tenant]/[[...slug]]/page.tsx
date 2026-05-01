export const dynamic = 'force-dynamic'
export const revalidate = 0

// app/sites/[tenant]/[[...slug]]/page.tsx
//
// Serves every page of a tenant's public website.
// Optional catch-all: handles the homepage (no slug) and all nested pages.
//
// TWO rendering modes:
//   1. EDITOR MODE  — user is owner/admin → renders EditorShell (client component)
//      with all section data. Loads the visual builder lazily.
//   2. PUBLIC MODE  — customer / unauthenticated → renders SectionRenderer (SSR,
//      cacheable, zero JS overhead for visitors).
//
// Zero-404 guarantee: unknown slugs silently fall back to the homepage.

import dynamicImport from 'next/dynamic'
import { getSiteByHost, getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import { SectionRenderer } from '@/components/site/SectionRenderer'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { BuilderSection, EditorContext } from '@/lib/builder/types'

// Lazy-load the editor bundle — customers NEVER download it
const EditorShell = dynamicImport(
  () => import('@/components/builder/EditorShell').then((m) => m.EditorShell),
  { ssr: false },
)

interface Props {
  params: Promise<{ tenant: string; slug?: string[] }>
}

export default async function TenantPage({ params }: Props) {
  const { tenant, slug } = await params
  const tenantKey = decodeURIComponent(tenant)
  const pageSlug  = slug?.join('/') ?? ''

  // ── Resolve tenant ─────────────────────────────────────────────────────────
  const siteData = tenantKey.includes('.')
    ? await getSiteByHost(tenantKey)
    : await getSiteBySlug(tenantKey)

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

  // ── Check editor access (server-side, never trust client) ─────────────────
  // getUserContext is safe in SSR — reads from cookies, not localStorage.
  let isEditor = false
  try {
    const ctx = await getUserContext()
    if (ctx && ['owner', 'admin'].includes(ctx.role)) {
      // owner can edit any tenant's site; admin can only edit their own
      isEditor = ctx.role === 'owner' || ctx.tenant_id === siteData.tenant.id
    }
  } catch {
    // Supabase unavailable — degrade gracefully to public mode
  }

  // ── Load published config ──────────────────────────────────────────────────
  const config = await getPublishedSiteConfig(siteData.tenant.id)

  if (!config) {
    // Site not published yet. Editors see a draft editor; customers see "coming soon".
    if (isEditor) {
      // Fetch draft sections so the editor can start from scratch / edit drafts
      const db = getSupabaseServerClient()
      const { data: draftPages } = await db
        .from('site_pages')
        .select('id, slug, title, page_type, sort_order')
        .eq('tenant_id', siteData.tenant.id)
        .neq('status', 'archived')
        .order('sort_order', { ascending: true })

      const homePage = (draftPages ?? []).find((p) =>
        p.page_type === 'home' || p.slug === '',
      ) ?? (draftPages ?? [])[0] ?? null

      if (homePage) {
        const { data: draftSections } = await db
          .from('site_sections')
          .select('*')
          .eq('page_id', homePage.id)
          .order('sort_order', { ascending: true })

        const editorCtx: EditorContext = {
          tenantId:    siteData.tenant.id,
          pageId:      homePage.id,
          pageName:    homePage.title ?? 'Home',
          pageSlug:    homePage.slug,
          isPublished: false,
          sections:    (draftSections ?? []) as BuilderSection[],
        }

        return <EditorShell editorCtx={editorCtx} />
      }
    }

    // Public "coming soon" view
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        gap: '1rem', padding: '4rem 1.5rem',
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

  // ── Resolve the correct page to show ──────────────────────────────────────
  let page = pageSlug === ''
    ? (config.pages.find((p) => p.page_type === 'home' || p.slug === '') ?? config.pages[0])
    : config.pages.find((p) => p.slug === pageSlug || p.slug === `/${pageSlug}`)

  // Zero-404: unknown slug → homepage
  if (!page) {
    page = config.pages.find((p) => p.page_type === 'home' || p.slug === '') ?? config.pages[0]
  }

  // ── EDITOR MODE ───────────────────────────────────────────────────────────
  if (isEditor && page) {
    // Pass all section data to the client editor shell
    const editorCtx: EditorContext = {
      tenantId:    siteData.tenant.id,
      pageId:      page.id,
      pageName:    page.title ?? (page.page_type === 'home' ? 'Home' : page.slug),
      pageSlug:    page.slug,
      isPublished: config.settings.is_published,
      sections:    page.sections as BuilderSection[],
    }

    return <EditorShell editorCtx={editorCtx} />
  }

  // ── PUBLIC / CUSTOMER MODE ────────────────────────────────────────────────
  if (!page) {
    return (
      <div style={{
        minHeight: '40vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '4rem 1.5rem',
      }}>
        <div style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
          <h1 style={{
            fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 700,
            color: 'var(--color-text)', fontFamily: 'var(--font-heading)', marginBottom: '0.5rem',
          }}>
            Welcome to {siteData.tenant.name}
          </h1>
          <p>Content coming soon.</p>
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
            color: 'var(--color-text)', fontFamily: 'var(--font-heading)', marginBottom: '0.5rem',
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
