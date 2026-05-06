// app/api/product-360/packages/[packageId]/requeue/route.ts
//
// POST — Reset a package stuck in 'generating' or a partial/failed state back to
// 'draft' and clear any stuck 'generating' frames back to 'pending'.
//
// This is a RECOVERY action, not a generation trigger. Use it when:
//   • A Vercel function was killed mid-generation (frames stuck in 'generating').
//   • The package is stuck in 'generating' after a timeout.
//   • You want to restart generation from scratch without a full regen.
//
// After requeue, the user can press Generate to trigger a fresh generation.
//
// Response:
//   { ok: true, data: { packageId, status, framesReset, message } }
//   { ok: false, error: { type, title, message } }

import { NextRequest, NextResponse }  from 'next/server'
import { resolveP360ApiUser }         from '@/lib/product-360/auth'
import { getSupabaseServerClient }    from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ packageId: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params

  const user = await resolveP360ApiUser(req)
  if (!user) {
    return NextResponse.json({
      ok: false, error: { type: 'auth_error', title: 'Unauthorized', message: 'Authentication required.' },
    }, { status: 401 })
  }
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({
      ok: false, error: { type: 'forbidden', title: 'Forbidden', message: 'Only owners and admins can requeue packages.' },
    }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* optional */ }

  const tenantId = user.isOwner
    ? (body.tenantId as string | undefined) ?? user.tenantId
    : user.tenantId

  if (!tenantId) {
    return NextResponse.json({
      ok: false, error: { type: 'invalid_request', title: 'Missing tenant', message: 'Could not resolve tenant.' },
    }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Verify ownership
  const { data: pkg } = await db
    .from('product_360_packages')
    .select('id, status, frames_done, target_frame_count')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!pkg) {
    return NextResponse.json({
      ok: false, error: { type: 'not_found', title: 'Not found', message: 'Package not found.' },
    }, { status: 404 })
  }

  const pkgStatus = (pkg as Record<string, unknown>).status as string

  // Blocked statuses
  if (pkgStatus === 'archived') {
    return NextResponse.json({
      ok: false, error: { type: 'conflict', title: 'Archived', message: 'Unarchive this package before requeuing.' },
    }, { status: 409 })
  }

  // ── Reset stuck 'generating' frames → 'pending' ───────────────────────────
  // These are frames that were mid-flight when the Vercel function was killed.
  const { count: framesReset } = await db
    .from('product_360_frames')
    .update({
      status:               'pending',
      generation_started_at: null,
      error_message:         null,
      updated_at:            new Date().toISOString(),
    })
    .eq('package_id', packageId)
    .eq('status', 'generating')
    .select('id', { count: 'exact', head: true })

  // ── Reset package back to draft so user can re-trigger generation ─────────
  await db.from('product_360_packages').update({
    status:             'draft',
    generation_error:   null,
    last_error_message: null,
    cancel_requested:   false,
    updated_at:         new Date().toISOString(),
  }).eq('id', packageId)

  console.info(`[p360:requeue] pkg=${packageId} reset to draft, ${framesReset ?? 0} stuck frames cleared`)

  return NextResponse.json({
    ok: true,
    data: {
      packageId,
      status:      'draft',
      framesReset: framesReset ?? 0,
      message:     `Package reset to draft. ${framesReset ?? 0} stuck frame(s) cleared. Press Generate to restart.`,
    },
  })
}
