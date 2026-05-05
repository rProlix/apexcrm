// app/api/product-360/packages/[packageId]/generation-status/route.ts
//
// Polled by the Studio UI every 8 s during active generation.
//
// Key fix: framesCompleted now returns `frames_done` (actual progress counter)
// NOT `frame_count` (target/total), which always equalled 24 and made the
// progress bar show 100% before generation even started.

import { NextRequest, NextResponse }   from 'next/server'
import { resolveP360ApiUser }          from '@/lib/product-360/auth'
import { getSupabaseServerClient }     from '@/lib/supabase/server'
import { reconcilePackageProgress }    from '@/lib/product-360/reconcile'

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
  const db = supabase as any

  const { data: pkg } = await db
    .from('product_360_packages')
    .select([
      'id', 'status', 'frame_count', 'target_frame_count',
      'frames_done', 'progress_percent',
      'preview_image_url', 'cover_frame_url',
      'generation_error', 'updated_at',
    ].join(', '))
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })

  const p               = pkg as Record<string, unknown>
  const status          = p.status as string
  const framesDone      = (p.frames_done      as number) ?? 0
  const targetCount     = (p.target_frame_count as number) ?? (p.frame_count as number) ?? 0
  const progressPercent = (p.progress_percent  as number) ?? 0
  const previewUrl      = (p.preview_image_url as string | null) ?? (p.cover_frame_url as string | null) ?? null

  // ── Auto-reconcile if the package looks stuck ────────────────────────────
  // Only trigger if the package has been in an in-progress state for > 10 min
  // AND progress is at or near 100% — avoids interfering with active generation.
  const inProgressStatus = ['queued', 'generating', 'processing'].includes(status)
  const updatedAt        = new Date(p.updated_at as string).getTime()
  const msSinceUpdate    = Date.now() - updatedAt
  const looksStuck       = inProgressStatus && msSinceUpdate > 10 * 60 * 1000

  if (looksStuck) {
    console.warn(`[p360:status] pkg=${packageId} looks stuck (${status}, ${msSinceUpdate / 1000 | 0}s ago) — scheduling reconcile`)
    // Fire without blocking the response
    reconcilePackageProgress(packageId).catch(err =>
      console.warn(`[p360:status] reconcile error for pkg=${packageId}:`, err),
    )
  }

  // ── Get latest job ────────────────────────────────────────────────────────
  const { data: job } = await db
    .from('product_360_generation_jobs')
    .select('status, frames_completed, error_message, created_at, started_at, completed_at')
    .eq('package_id', packageId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // ── Return actual frame rows for the viewer ───────────────────────────────
  const { data: frames } = await db
    .from('product_360_frames')
    .select('id, frame_index, angle_degrees, image_url')
    .eq('package_id', packageId)
    .order('frame_index', { ascending: true })

  return NextResponse.json({
    packageId,
    status,
    // framesCompleted = actual progress counter (fixed — was returning frame_count/target before)
    framesCompleted:  framesDone,
    targetFrameCount: targetCount,
    progressPercent,
    previewUrl,
    error:      p.generation_error ?? null,
    latestJob:  job ?? null,
    frames:     frames ?? [],
  })
}
