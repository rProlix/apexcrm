// app/api/product-360/packages/[packageId]/generate/route.ts
import { NextRequest, NextResponse }  from 'next/server'
import { resolveP360ApiUser }         from '@/lib/product-360/auth'
import { getSupabaseServerClient }    from '@/lib/supabase/server'
import { generatePackage }            from '@/lib/product-360/generationService'
import { getConfiguredProvider }      from '@/lib/product-360/providers/imagineMidjourney'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ packageId: string }> }

// POST /api/product-360/packages/[packageId]/generate
export async function POST(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = user.isOwner
    ? ((await req.json().catch(() => ({}))) as Record<string, unknown>).tenantId as string ?? user.tenantId
    : user.tenantId

  const supabase = getSupabaseServerClient()

  // Verify package belongs to tenant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pkg } = await (supabase as any)
    .from('product_360_packages')
    .select('id, status, product_id, generation_prompt, target_frame_count')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })

  const currentStatus = (pkg as Record<string, unknown>).status as string
  if (currentStatus === 'generating' || currentStatus === 'queued') {
    return NextResponse.json({ error: 'Generation already in progress' }, { status: 409 })
  }

  if (!getConfiguredProvider()) {
    return NextResponse.json({
      error: 'AI generation is not configured. Set IMAGINE_API_TOKEN in environment variables.',
    }, { status: 503 })
  }

  // Set to queued
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('product_360_packages')
    .update({ status: 'queued', generation_error: null, updated_at: new Date().toISOString() })
    .eq('id', packageId)

  // Fire-and-forget generation (do not await — respond immediately)
  generatePackage(packageId).catch(err => {
    console.error(`[p360:generate] packageId=${packageId}`, err)
  })

  return NextResponse.json({ success: true, status: 'queued', packageId })
}
