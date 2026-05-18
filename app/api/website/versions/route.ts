// app/api/website/versions/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import {
  getWebsiteVersions,
  createWebsiteVersion,
  getCurrentWebsiteSnapshot,
} from '@/lib/website/versioning'
import type { WebsiteVersionSource, ClientPageSections } from '@/lib/website/versionTypes'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function GET() {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()
  if (!ctx.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const result = await getWebsiteVersions(ctx.tenant_id)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  return NextResponse.json({ versions: result.data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()
  if (!ctx.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const {
    label,
    description,
    source,
    clientPageSections,
  } = body as {
    label?: string
    description?: string
    source?: WebsiteVersionSource
    clientPageSections?: ClientPageSections
  }

  // Validate clientPageSections if provided
  let validatedClientSections: ClientPageSections | undefined
  if (clientPageSections && typeof clientPageSections === 'object') {
    const { pageId, pageSlug, sections } = clientPageSections
    if (pageId && pageSlug && Array.isArray(sections)) {
      validatedClientSections = clientPageSections
      if (process.env.NODE_ENV === 'development') {
        console.log(
          `[POST /api/website/versions] client sections provided: pageId=${pageId} ` +
          `sections=${sections.length} slug="${pageSlug}"`
        )
      }
    }
  }

  // Build snapshot: use client sections for the current page if provided,
  // DB data for all other pages, settings, navigation
  const snapResult = await getCurrentWebsiteSnapshot(ctx.tenant_id, validatedClientSections)
  if (snapResult.error || !snapResult.data) {
    return NextResponse.json(
      { ok: false, error: snapResult.error ?? 'Could not capture snapshot' },
      { status: 500 },
    )
  }

  const result = await createWebsiteVersion({
    tenantId:    ctx.tenant_id,
    label:       label ?? 'Manual checkpoint',
    description: description ?? undefined,
    source:      source ?? 'manual',
    status:      'draft',
    createdBy:   ctx.id,
    snapshot:    snapResult.data,
  })

  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }

  return NextResponse.json({
    ok:      true,
    version: result.data,
  }, { status: 201 })
}
