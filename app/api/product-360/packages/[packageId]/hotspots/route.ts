// app/api/product-360/packages/[packageId]/hotspots/route.ts
import { NextRequest, NextResponse }  from 'next/server'
import { resolveP360ApiUser }         from '@/lib/product-360/auth'
import { listHotspots, createHotspot } from '@/lib/product-360/frameService'
import { getSupabaseServerClient }    from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ packageId: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const hotspots = await listHotspots(packageId)
    return NextResponse.json({ hotspots })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

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

  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pkg } = await (supabase as any)
    .from('product_360_packages')
    .select('product_id')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.label || typeof body.x !== 'number' || typeof body.y !== 'number') {
    return NextResponse.json({ error: 'label, x, and y are required' }, { status: 400 })
  }

  try {
    const hotspot = await createHotspot({
      tenantId,
      packageId,
      productId:   (pkg as Record<string, unknown>).product_id as string,
      frameIndex:  body.frameIndex  as number | undefined,
      label:       body.label       as string,
      description: body.description as string | undefined,
      x:           body.x           as number,
      y:           body.y           as number,
      z:           body.z           as number | undefined,
      actionType:  body.actionType  as string | undefined,
      actionValue: body.actionValue as string | undefined,
    })
    return NextResponse.json({ hotspot }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
