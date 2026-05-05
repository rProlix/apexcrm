// app/api/product-360/packages/[packageId]/set-primary/route.ts
// POST — Sets this package as the primary/default for its product.
// Clears is_primary / is_default on all other packages for the same tenant+product.
import { NextRequest, NextResponse }   from 'next/server'
import { resolveP360ApiUser }          from '@/lib/product-360/auth'
import { setPrimaryPackage }           from '@/lib/product-360/packageService'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ packageId: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params
  const user = await resolveP360ApiUser(req)

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = user.isOwner
    ? (req.nextUrl.searchParams.get('tenantId') ?? user.tenantId)
    : user.tenantId

  try {
    const pkg = await setPrimaryPackage(packageId, tenantId)
    return NextResponse.json({ package: pkg })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to set primary package'
    console.error('[/api/product-360/packages/[packageId]/set-primary] Error:', msg, { packageId, tenantId })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
