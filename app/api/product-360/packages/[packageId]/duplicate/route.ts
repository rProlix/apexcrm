// app/api/product-360/packages/[packageId]/duplicate/route.ts
// POST — Duplicate an existing 360° package (metadata only, not frames).
import { NextRequest, NextResponse }           from 'next/server'
import { resolveP360ApiUser, resolveTenantId } from '@/lib/product-360/auth'
import { duplicatePackage }                    from '@/lib/product-360/packageService'

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

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const tenantId = resolveTenantId(user, body.tenantId as string | null)
  if (!tenantId) return NextResponse.json({ error: 'Could not resolve tenant' }, { status: 400 })

  const newName = ((body.name as string | undefined) ?? '').trim()
  if (!newName) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  try {
    const pkg = await duplicatePackage(packageId, tenantId, newName, user.userId)
    return NextResponse.json({ package: pkg }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Duplicate failed' }, { status: 500 })
  }
}
