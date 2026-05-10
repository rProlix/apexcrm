// app/api/website/debug-render/route.ts
// GET /api/website/debug-render?tenant=<slug>&slug=<page-slug>
//
// Returns a full diagnostic JSON report of how a page would be rendered.
// Protected: only accessible to owner, admin, or staff.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSiteBySlug } from '@/lib/website/getSiteByHost'
import { getPublishedSiteConfig, getDraftSiteConfig } from '@/lib/website/getPublishedSiteConfig'
import {
  normalizeSection,
  normalizeSectionType,
  isPublicVisible,
  bySortOrder,
} from '@/lib/website/normalizeWebsiteSection'
import { hasRenderer } from '@/lib/website/sectionRegistry'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return forbidden()
  if (!['owner', 'admin', 'staff'].includes(ctx.role)) return forbidden()

  const url        = new URL(req.url)
  const tenantSlug = url.searchParams.get('tenant') ?? ''
  const pageSlug   = url.searchParams.get('slug')   ?? ''

  if (!tenantSlug) {
    return NextResponse.json({ error: 'tenant param required' }, { status: 400 })
  }

  const report: Record<string, unknown> = {
    requestedTenant: tenantSlug,
    requestedSlug:   pageSlug,
    timestamp:       new Date().toISOString(),
  }

  // Tenant resolution
  const siteData = await getSiteBySlug(tenantSlug).catch(() => null)
  report.tenantResolved   = !!siteData
  report.tenantId         = siteData?.tenant?.id ?? null
  report.tenantName       = siteData?.tenant?.name ?? null
  report.tenantSlug       = siteData?.tenant?.slug ?? null
  report.siteIsPublished  = siteData?.isPublished ?? false

  if (!siteData) {
    report.error = 'Tenant not found'
    return NextResponse.json(report)
  }

  // RBAC: admin can only inspect their own tenant
  if (ctx.role !== 'owner' && ctx.tenant_id !== siteData.tenant.id) {
    return forbidden()
  }

  const tenantId = siteData.tenant.id

  // Config (draft includes unpublished pages)
  const config = await getDraftSiteConfig(tenantId).catch(() => null)
  report.configFound     = !!config
  report.settingsId      = config?.settings?.id ?? null
  report.totalPageCount  = config?.pages?.length ?? 0
  report.pageList        = config?.pages?.map((p) => ({
    id: p.id, slug: p.slug, title: p.title, page_type: p.page_type, status: p.status,
    sectionCount: (p.sections ?? []).length,
  })) ?? []

  if (!config) {
    report.error = 'No site config found (no settings row or no pages)'
    return NextResponse.json(report)
  }

  // Find target page
  const page = pageSlug
    ? config.pages.find((p) =>
        p.slug === pageSlug || p.slug === `/${pageSlug}` || p.slug.replace(/^\//, '') === pageSlug,
      )
    : config.pages.find((p) => p.page_type === 'home' || p.slug === '') ?? config.pages[0]

  report.pageFound = !!page
  report.pageId    = page?.id ?? null

  if (!page) {
    report.error = 'Page not found'
    return NextResponse.json(report)
  }

  // Section analysis
  const rawSections = page.sections ?? []
  report.rawSectionCount = rawSections.length

  const sectionDiagnostics = rawSections.map((raw, index) => {
    const rawAny    = raw as unknown as Record<string, unknown>
    const rawType   = String(rawAny.section_type ?? rawAny.type ?? '(missing)')
    const canonical = normalizeSectionType(rawType)
    const renderer  = hasRenderer(canonical)

    let normalized: ReturnType<typeof normalizeSection> | null = null
    let normalizeError: string | null = null
    try {
      normalized = normalizeSection(raw)
    } catch (e) {
      normalizeError = e instanceof Error ? e.message : String(e)
    }

    const missingFields: string[] = []
    const contentObj = (rawAny.content ?? {}) as Record<string, unknown>
    if (!contentObj || typeof contentObj !== 'object') {
      missingFields.push('content (null or non-object)')
    }

    return {
      index,
      id:             String(rawAny.id ?? ''),
      rawType,
      canonicalType:  canonical,
      rendererFound:  renderer,
      isVisible:      rawAny.is_visible !== false,
      status:         String(rawAny.status ?? 'published'),
      sortOrder:      Number(rawAny.sort_order ?? 0),
      publicVisible:  normalized ? isPublicVisible(normalized) : false,
      normalizeError,
      missingFields,
      contentKeys:    typeof contentObj === 'object' && contentObj !== null
        ? Object.keys(contentObj)
        : [],
    }
  })

  report.sections            = sectionDiagnostics
  report.publicVisibleCount  = sectionDiagnostics.filter((s) => s.publicVisible).length
  report.rendererMissingFor  = sectionDiagnostics.filter((s) => !s.rendererFound).map((s) => s.rawType)
  report.normalizeErrors     = sectionDiagnostics.filter((s) => s.normalizeError).map((s) => ({
    index: s.index, rawType: s.rawType, error: s.normalizeError,
  }))

  return NextResponse.json(report, { status: 200 })
}
