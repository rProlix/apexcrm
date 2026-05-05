// app/api/product-360/packages/[packageId]/cancel/route.ts
//
// POST — stop an active 360° generation for a package.
//
// Sets cancel_requested = true in the database.  The generation loop in
// generationService.ts polls this flag before every frame and will stop
// cleanly, preserving all frames that were already generated.
//
// Idempotent: calling it on an already-cancelled package returns 200 ok.
//
// Response shapes:
//   Success → { ok: true,  data: { packageId, status: "cancelled", message, framesSaved } }
//   Error   → { ok: false, error: { type, title, message, details? } }

import { NextRequest, NextResponse }  from 'next/server'
import { resolveP360ApiUser }         from '@/lib/product-360/auth'
import { getSupabaseServerClient }    from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ packageId: string }> }

// Statuses from which a cancel can be requested
const CANCELLABLE_STATUSES = new Set(['queued', 'planning', 'generating', 'processing'])

export async function POST(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params

  // ── Auth ────────────────────────────────────────────────────────────────────
  const user = await resolveP360ApiUser(req)
  if (!user) {
    return NextResponse.json({
      ok: false,
      error: { type: 'auth_error', title: 'Unauthorized', message: 'Authentication required.' },
    }, { status: 401 })
  }
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({
      ok: false,
      error: { type: 'forbidden', title: 'Forbidden', message: 'Only owners and admins can stop generation.' },
    }, { status: 403 })
  }

  // ── Tenant ──────────────────────────────────────────────────────────────────
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* body optional */ }

  const tenantId = user.isOwner
    ? (body.tenantId as string | undefined) ?? user.tenantId
    : user.tenantId

  if (!tenantId) {
    return NextResponse.json({
      ok: false,
      error: { type: 'invalid_request', title: 'Missing tenant', message: 'Could not resolve tenant.' },
    }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // ── Load package ────────────────────────────────────────────────────────────
  const { data: pkg, error: fetchErr } = await db
    .from('product_360_packages')
    .select('id, status, frames_done, target_frame_count, cancel_requested')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (fetchErr) {
    console.error('[p360:cancel] fetch error:', fetchErr.message)
    return NextResponse.json({
      ok: false,
      error: { type: 'internal', title: 'Database error', message: 'Failed to load package.', details: fetchErr.message },
    }, { status: 500 })
  }

  if (!pkg) {
    return NextResponse.json({
      ok: false,
      error: { type: 'not_found', title: 'Package not found', message: 'No package with this ID exists for your account.' },
    }, { status: 404 })
  }

  const currentStatus = pkg.status as string
  const framesSaved   = (pkg.frames_done as number) ?? 0

  // ── Already cancelled — idempotent return ───────────────────────────────────
  if (currentStatus === 'cancelled') {
    return NextResponse.json({
      ok: true,
      data: { packageId, status: 'cancelled', framesSaved, message: 'Package is already cancelled.' },
    })
  }

  // ── Cannot cancel completed/ready packages ─────────────────────────────────
  if (currentStatus === 'ready' || currentStatus === 'completed') {
    return NextResponse.json({
      ok: false,
      error: {
        type:    'invalid_request',
        title:   'Cannot cancel',
        message: 'Generation is already complete — there is nothing to stop.',
      },
    }, { status: 409 })
  }

  // ── If not in an active generation, just mark cancelled directly ────────────
  // (draft, failed, paused_quota, archived — user may want to "cancel" to clean up)
  const now = new Date().toISOString()

  if (!CANCELLABLE_STATUSES.has(currentStatus)) {
    const { error: updateErr } = await db
      .from('product_360_packages')
      .update({
        status:              'cancelled',
        cancel_requested:    true,
        cancel_requested_at: now,
        cancelled_at:        now,
        updated_at:          now,
      })
      .eq('id', packageId)
      .eq('tenant_id', tenantId)

    if (updateErr) {
      return NextResponse.json({
        ok: false,
        error: { type: 'internal', title: 'Update failed', message: 'Failed to cancel package.', details: updateErr.message },
      }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      data: { packageId, status: 'cancelled', framesSaved, message: `Package cancelled. ${framesSaved} frames were saved.` },
    })
  }

  // ── Active generation: set cancel_requested flag ───────────────────────────
  // The generation loop in generationService.ts will detect this before the
  // next frame and stop, preserving all already-generated frames.
  const { error: cancelErr } = await db
    .from('product_360_packages')
    .update({
      cancel_requested:    true,
      cancel_requested_at: now,
      status:              'cancelled',
      cancelled_at:        now,
      updated_at:          now,
    })
    .eq('id', packageId)
    .eq('tenant_id', tenantId)

  if (cancelErr) {
    console.error('[p360:cancel] update error:', cancelErr.message)
    return NextResponse.json({
      ok: false,
      error: { type: 'internal', title: 'Update failed', message: 'Failed to request cancellation.', details: cancelErr.message },
    }, { status: 500 })
  }

  console.info(
    `[p360:cancel] pkg=${packageId} cancel_requested=true (was: ${currentStatus}, ${framesSaved} frames saved)`,
  )

  return NextResponse.json({
    ok: true,
    data: {
      packageId,
      status:      'cancelled',
      framesSaved,
      message:     `Stopping generation. ${framesSaved} frame${framesSaved !== 1 ? 's' : ''} already generated will be saved.`,
    },
  })
}
