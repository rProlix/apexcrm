// app/api/website/3d-diagnostics/route.ts
// Returns Premium 3D Scroll Hero diagnostics for the caller's tenant.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext }           from '@/lib/auth/getUserContext'
import { buildScrollHeroDiagnostics } from '@/lib/website/premium3d/diagnostics'

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const tenantId = req.nextUrl.searchParams.get('tenantId') ?? ctx.tenant_id ?? ''
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
  if (ctx.role !== 'owner' && ctx.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const diagnostics = await buildScrollHeroDiagnostics(tenantId)
  return NextResponse.json({ diagnostics })
}
