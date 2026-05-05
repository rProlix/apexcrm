// app/api/product-360/packages/[packageId]/generate/route.ts
import { NextRequest, NextResponse }  from 'next/server'
import { resolveP360ApiUser }         from '@/lib/product-360/auth'
import { getSupabaseServerClient }    from '@/lib/supabase/server'
import { generatePackage }            from '@/lib/product-360/generationService'
import { getP360Provider }            from '@/lib/ai/360/provider'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ packageId: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* ok, body optional */ }

  const tenantId = user.isOwner
    ? (body.tenantId as string | undefined) ?? user.tenantId
    : user.tenantId

  if (!tenantId) return NextResponse.json({ error: 'Could not resolve tenant' }, { status: 400 })

  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: pkg } = await db
    .from('product_360_packages')
    .select('id, status, product_id')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })

  const currentStatus = (pkg as Record<string, unknown>).status as string
  if (currentStatus === 'generating' || currentStatus === 'queued') {
    return NextResponse.json({ error: 'Generation already in progress' }, { status: 409 })
  }

  const provider = getP360Provider()
  if (!provider) {
    return NextResponse.json({
      error: 'AI generation is not configured. Set GEMINI_API_KEY in environment variables.',
    }, { status: 503 })
  }

  await db
    .from('product_360_packages')
    .update({ status: 'queued', generation_error: null, updated_at: new Date().toISOString() })
    .eq('id', packageId)

  // Fire-and-forget
  generatePackage(packageId).catch(err => {
    console.error(`[p360:generate] packageId=${packageId}`, err)
  })

  return NextResponse.json({ success: true, status: 'queued', packageId })
}
