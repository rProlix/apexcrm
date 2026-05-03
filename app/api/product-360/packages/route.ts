// app/api/product-360/packages/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveP360ApiUser, resolveTenantId } from '@/lib/product-360/auth'
import { listPackages, createPackage }          from '@/lib/product-360/packageService'

export const dynamic = 'force-dynamic'

// GET /api/product-360/packages
// Query params: tenantId (owner only), productId
export async function GET(req: NextRequest) {
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const tenantId = resolveTenantId(user, searchParams.get('tenantId'))
  if (!tenantId) return NextResponse.json({ error: 'Could not resolve tenant' }, { status: 400 })

  const productId        = searchParams.get('productId') ?? undefined
  const includeArchived  = searchParams.get('archived') === 'true'

  try {
    const packages = await listPackages({ tenantId, productId, includeArchived })
    return NextResponse.json({ packages })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to list packages'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/product-360/packages
export async function POST(req: NextRequest) {
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const tenantId = resolveTenantId(user, body.tenantId as string | null)
  if (!tenantId) return NextResponse.json({ error: 'Could not resolve tenant' }, { status: 400 })

  const productId = body.productId as string | undefined
  if (!productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 })

  const name = (body.name as string | undefined)?.trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  try {
    const pkg = await createPackage({
      tenantId,
      productId,
      createdBy:         user.userId,
      name,
      description:       body.description       as string | undefined,
      packageType:       body.packageType        as string | undefined,
      generationPrompt:  body.generationPrompt   as string | undefined,
      negativePrompt:    body.negativePrompt     as string | undefined,
      targetFrameCount:  body.targetFrameCount   as number | undefined,
      settings:          body.settings           as Record<string, unknown> | undefined,
    })
    return NextResponse.json({ package: pkg }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create package'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
