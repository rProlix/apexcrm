// app/api/product-360/packages/[packageId]/generation-status/route.ts
//
// Polled by the Studio UI every 8 s during active generation.
//
// Critical design decisions:
//
// 1. framesCompleted = COUNT of actual rows in product_360_frames
//    NOT the packages.frames_done column (which only updates every 3 frames
//    in the generation loop, causing the "jumps backward from 20 to 18" bug).
//    Actual rows are inserted after each successful frame upload, so the count
//    is always the most accurate representation of real progress.
//
// 2. completedFrameUrls is returned sorted by frame_index.
//    The client uses this to power the in-progress sequence preview
//    (Product360SequencePreview) without waiting for all frames to finish.
//
// 3. updatedAt is returned so the client can detect and discard stale responses.

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

  // ── Load package ──────────────────────────────────────────────────────────
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

  const p           = pkg as Record<string, unknown>
  const status      = p.status as string
  const framesDone  = (p.frames_done       as number) ?? 0
  const targetCount = (p.target_frame_count as number) ?? (p.frame_count as number) ?? 0
  const updatedAt   = p.updated_at as string

  // ── Load all frame rows ────────────────────────────────────────────────────
  // This is the source of truth for progress.
  // Each row is inserted immediately after a frame is uploaded to storage,
  // so the count here is always ahead of (or equal to) packages.frames_done.
  const { data: frames } = await db
    .from('product_360_frames')
    .select('id, frame_index, angle_degrees, image_url')
    .eq('package_id', packageId)
    .order('frame_index', { ascending: true })

  const frameRows = (frames ?? []) as Array<{
    id: string
    frame_index: number
    angle_degrees: number | null
    image_url: string | null
  }>

  // Actual completed count from DB rows (may be higher than frames_done column)
  const actualFramesCompleted = frameRows.length
  // Monotonically correct: never lower than what the package column says
  const framesCompleted = Math.max(framesDone, actualFramesCompleted)

  const progressPercent = targetCount > 0
    ? Math.min(100, Math.floor((framesCompleted / targetCount) * 100))
    : (p.progress_percent as number) ?? 0

  // Completed frame URLs for the sequence preview (in-progress live scrubbing)
  const completedFrameUrls = frameRows
    .filter(f => !!f.image_url)
    .map(f => f.image_url as string)

  const previewUrl = (p.preview_image_url as string | null)
    ?? (p.cover_frame_url as string | null)
    ?? completedFrameUrls[0]    // first frame as fallback
    ?? null

  // ── Auto-reconcile if the package looks stuck ──────────────────────────────
  const inProgressStatus = ['queued', 'generating', 'processing'].includes(status)
  const updatedAtMs      = new Date(updatedAt).getTime()
  const msSinceUpdate    = Date.now() - updatedAtMs
  const looksStuck       = inProgressStatus && msSinceUpdate > 10 * 60 * 1000

  if (looksStuck) {
    console.warn(
      `[p360:status] pkg=${packageId} looks stuck (${status}, ${msSinceUpdate / 1000 | 0}s ago) — scheduling reconcile`,
    )
    reconcilePackageProgress(packageId).catch(err =>
      console.warn(`[p360:status] reconcile error for pkg=${packageId}:`, err),
    )
  }

  // ── Get latest job ─────────────────────────────────────────────────────────
  const { data: job } = await db
    .from('product_360_generation_jobs')
    .select('status, frames_completed, error_message, created_at, started_at, completed_at')
    .eq('package_id', packageId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    packageId,
    status,
    // Number of completed frames (from DB rows — more accurate than frames_done column)
    framesCompleted,
    targetFrameCount: targetCount,
    progressPercent,
    previewUrl,
    // Ordered URLs for the in-progress sequence preview
    completedFrameUrls,
    // Full frame rows for the viewer
    frames: frameRows,
    // Timestamp for client-side stale detection
    updatedAt,
    error:     p.generation_error ?? null,
    latestJob: job ?? null,
  })
}
