// app/api/website/versions/autosave/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { createAutosaveVersion } from '@/lib/website/versioning'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST() {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()
  if (!ctx.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })
  if (!ctx.auth_id)   return NextResponse.json({ error: 'No auth user' }, { status: 400 })

  // ctx.auth_id = auth.users UUID (required by site_versions.created_by FK)
  const result = await createAutosaveVersion(ctx.tenant_id, ctx.auth_id)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  return NextResponse.json({
    version: result.data,
    skipped: result.data === null,
  })
}
