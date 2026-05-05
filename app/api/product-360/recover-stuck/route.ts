// app/api/product-360/recover-stuck/route.ts
// POST — Recover ALL stuck packages for the current tenant.
// A package is "stuck" if it has been in queued/generating/processing for > 10 min.
// Owner / admin only.

import { NextRequest, NextResponse }  from 'next/server'
import { resolveP360ApiUser }         from '@/lib/product-360/auth'
import { recoverStuckPackages }       from '@/lib/product-360/reconcile'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* ok */ }

  const tenantId = user.isOwner
    ? (body.tenantId as string | undefined) ?? user.tenantId
    : user.tenantId

  if (!tenantId) return NextResponse.json({ error: 'Could not resolve tenant' }, { status: 400 })

  const result = await recoverStuckPackages(tenantId)

  return NextResponse.json({
    success: true,
    tenantId,
    ...result,
  })
}
