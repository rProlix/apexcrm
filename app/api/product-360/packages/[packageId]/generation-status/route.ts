// app/api/product-360/packages/[packageId]/generation-status/route.ts
import { NextRequest, NextResponse }  from 'next/server'
import { resolveP360ApiUser }         from '@/lib/product-360/auth'
import { getSupabaseServerClient }    from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ packageId: string }> }

// GET /api/product-360/packages/[packageId]/generation-status
export async function GET(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenantId = user.isOwner
    ? (req.nextUrl.searchParams.get('tenantId') ?? user.tenantId)
    : user.tenantId

  const supabase = getSupabaseServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pkg } = await (supabase as any)
    .from('product_360_packages')
    .select('id, status, frame_count, target_frame_count, generation_error, cover_frame_url')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })

  // Get latest job
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job } = await (supabase as any)
    .from('product_360_generation_jobs')
    .select('status, frames_completed, error_message, created_at, started_at, completed_at')
    .eq('package_id', packageId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Get frames
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: frames } = await (supabase as any)
    .from('product_360_frames')
    .select('id, frame_index, angle_degrees, image_url')
    .eq('package_id', packageId)
    .order('frame_index', { ascending: true })

  const p = pkg as Record<string, unknown>

  return NextResponse.json({
    packageId,
    status:             p.status,
    framesCompleted:    p.frame_count ?? 0,
    targetFrameCount:   p.target_frame_count ?? 36,
    coverUrl:           p.cover_frame_url ?? null,
    error:              p.generation_error ?? null,
    latestJob:          job ?? null,
    frames:             frames ?? [],
  })
}
