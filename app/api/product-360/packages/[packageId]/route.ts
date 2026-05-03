// app/api/product-360/packages/[packageId]/route.ts
import { NextRequest, NextResponse }              from 'next/server'
import { resolveP360ApiUser }                     from '@/lib/product-360/auth'
import { getPackageWithFrames, updatePackage, archivePackage } from '@/lib/product-360/packageService'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ packageId: string }> }

// GET /api/product-360/packages/[packageId]
export async function GET(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenantId = user.isOwner
    ? (req.nextUrl.searchParams.get('tenantId') ?? user.tenantId)
    : user.tenantId

  try {
    const pkg = await getPackageWithFrames(packageId, tenantId)
    if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
    return NextResponse.json({ package: pkg })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to get package'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH /api/product-360/packages/[packageId]
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = user.isOwner
    ? (req.nextUrl.searchParams.get('tenantId') ?? user.tenantId)
    : user.tenantId

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const allowed = [
    'name','slug','description','status','is_enabled','is_default',
    'package_type','promo_starts_at','promo_ends_at','generation_prompt',
    'negative_prompt','target_frame_count','settings','lighting_config',
    'camera_config','hotspot_config','cover_frame_url','model_url','ar_model_url',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'No valid update fields provided' }, { status: 400 })
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pkg = await updatePackage(packageId, tenantId, updates as any)
    return NextResponse.json({ package: pkg })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update package'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE /api/product-360/packages/[packageId]
export async function DELETE(req: NextRequest, ctx: Ctx) {
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
    const pkg = await getPackageWithFrames(packageId, tenantId)
    if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
    await archivePackage(packageId, tenantId, pkg.product_id ?? '')
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to delete package'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
