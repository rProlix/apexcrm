// app/api/product-360/products/route.ts
// Returns store products scoped to the resolved tenant, for use in 360 Studio.
// Supports search, pagination, active filter.
// Owner can pass ?tenantId= to inspect any tenant.
import { NextRequest, NextResponse }           from 'next/server'
import { resolveP360ApiUser, resolveTenantId } from '@/lib/product-360/auth'
import { listStoreProducts }                   from '@/lib/product-360/packageService'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await resolveP360ApiUser(req)
  if (!user) {
    console.warn('[/api/product-360/products] Unauthenticated request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (user.role !== 'owner' && user.role !== 'admin') {
    console.warn('[/api/product-360/products] Forbidden — role:', user.role)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const tenantId = resolveTenantId(user, searchParams.get('tenantId'))
  if (!tenantId) {
    console.error('[/api/product-360/products] Could not resolve tenantId', {
      role: user.role,
      userTenantId: user.tenantId,
      requestedTenantId: searchParams.get('tenantId'),
    })
    return NextResponse.json({ error: 'Could not resolve tenant' }, { status: 400 })
  }

  const search = searchParams.get('search') ?? undefined
  const page   = parseInt(searchParams.get('page')  ?? '1',  10)
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '24', 10), 100)
  const all    = searchParams.get('all') === 'true'

  try {
    const { products, total } = await listStoreProducts({
      tenantId,
      search,
      page,
      limit,
      activeOnly: !all,
    })
    return NextResponse.json({ products, total, page, limit })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to load products'
    console.error('[/api/product-360/products] Error:', msg, { tenantId, role: user.role })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
