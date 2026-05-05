// app/api/product-360/packages/[packageId]/regenerate/route.ts
// POST — Regenerate ALL frames in a package (same as generate but re-runs even if ready).
import { NextRequest, NextResponse }           from 'next/server'
import { resolveP360ApiUser, resolveTenantId } from '@/lib/product-360/auth'
import { generatePackage }                     from '@/lib/product-360/generationService'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ packageId: string }> },
) {
  const { packageId } = await params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* ok */ }

  const tenantId = resolveTenantId(user, body.tenantId as string | null)
  if (!tenantId) return NextResponse.json({ error: 'Could not resolve tenant' }, { status: 400 })

  // Fire and forget — generation is async
  generatePackage(packageId).catch(err =>
    console.error(`[p360:regenerate] packageId=${packageId}:`, err),
  )

  return NextResponse.json({ message: 'Regeneration started', packageId })
}
