// app/api/website/versions/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getWebsiteVersions, createWebsiteVersion } from '@/lib/website/versioning'
import type { WebsiteVersionSource } from '@/lib/website/versionTypes'

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
  const { label, description, source } = body as {
    label?: string
    description?: string
    source?: WebsiteVersionSource
  }

  const result = await createWebsiteVersion({
    tenantId:    ctx.tenant_id,
    label:       label ?? 'Manual checkpoint',
    description: description ?? undefined,
    source:      source ?? 'manual',
    status:      'draft',
    createdBy:   ctx.id ?? undefined,
  })

  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  return NextResponse.json({ version: result.data }, { status: 201 })
}
