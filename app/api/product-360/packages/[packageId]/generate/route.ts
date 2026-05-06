// app/api/product-360/packages/[packageId]/generate/route.ts
//
// POST — start (or resume) generation for a 360° package.
//
// This route AWAITS generatePackage() synchronously so the Vercel function
// stays alive until generation completes. maxDuration = 300 (5 min) gives
// enough headroom for 24 Imagen frames at ~1.5 s throttle delay each.
//
// Response shapes:
//   Success  → { ok: true,  data: { status, packageId, framesGenerated, previewUrl } }
//   Quota    → { ok: false, error: { type: 'quota_exceeded', title, message, retryable, retryAt } }
//   Failure  → { ok: false, error: { type, title, message, retryable } }
//
// Resume behaviour:
//   Packages in status 'paused_quota' or 'failed' CAN be re-submitted to this
//   route. The generation service will skip already-completed frames and
//   continue from where it left off.

import { NextRequest, NextResponse }  from 'next/server'
import { resolveP360ApiUser }         from '@/lib/product-360/auth'
import { getSupabaseServerClient }    from '@/lib/supabase/server'
import { generatePackage }            from '@/lib/product-360/generationService'
import { getP360Provider }            from '@/lib/ai/360/provider'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300  // seconds — Vercel Pro/Enterprise

type Ctx = { params: Promise<{ packageId: string }> }

// Statuses from which generation (or resume) may start
const RESUMABLE_STATUSES = new Set(['draft', 'failed', 'paused_quota', 'cancelled'])

export async function POST(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ ok: false, error: { type: 'auth_error', title: 'Unauthorized', message: 'Unauthorized', retryable: false } }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: { type: 'auth_error', title: 'Forbidden', message: 'Only owners and admins can generate 360° packages', retryable: false } }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* body optional */ }

  const tenantId = user.isOwner
    ? (body.tenantId as string | undefined) ?? user.tenantId
    : user.tenantId

  if (!tenantId) return NextResponse.json({ ok: false, error: { type: 'invalid_request', title: 'Missing tenant', message: 'Could not resolve tenant', retryable: false } }, { status: 400 })

  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // ── Validate package ────────────────────────────────────────────────────────
  const { data: pkg } = await db
    .from('product_360_packages')
    .select('id, status, product_id, frames_done, target_frame_count, next_retry_at')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!pkg) {
    return NextResponse.json({ ok: false, error: { type: 'invalid_request', title: 'Not found', message: 'Package not found', retryable: false } }, { status: 404 })
  }

  const currentStatus = (pkg as Record<string, unknown>).status as string

  if (currentStatus === 'generating' || currentStatus === 'processing') {
    return NextResponse.json({
      ok: false,
      error: { type: 'invalid_request', title: 'Already running', message: 'Generation is already in progress for this package', retryable: false },
    }, { status: 409 })
  }

  if (!RESUMABLE_STATUSES.has(currentStatus) && currentStatus !== 'queued') {
    return NextResponse.json({
      ok: false,
      error: { type: 'invalid_request', title: 'Cannot generate', message: `Package is in status "${currentStatus}" and cannot be started. Archive it and create a new package.`, retryable: false },
    }, { status: 409 })
  }

  // ── Check next_retry_at for paused_quota packages ───────────────────────────
  const nextRetryAt = (pkg as Record<string, unknown>).next_retry_at as string | null
  if (currentStatus === 'paused_quota' && nextRetryAt) {
    const retryMs = new Date(nextRetryAt).getTime()
    const nowMs   = Date.now()
    if (retryMs > nowMs && !body.forceResume) {
      const waitSec = Math.ceil((retryMs - nowMs) / 1000)
      return NextResponse.json({
        ok: false,
        error: {
          type:      'quota_exceeded',
          title:     'Too soon to retry',
          message:   `Quota still limited. Try again in ${waitSec}s (or send forceResume: true to override).`,
          retryable: true,
          retryAt:   nextRetryAt,
        },
      }, { status: 429 })
    }
  }

  // ── Set queued FIRST so the UI sees state change immediately ──────────────────
  // Done before the provider check so any subsequent failure sets status → 'failed'
  // in the DB, which fetchPackages() will pick up. Without this order, a missing
  // API key left the package in 'draft' indefinitely with no visible error.
  const existingDone = (pkg as Record<string, unknown>).frames_done as number ?? 0
  await db
    .from('product_360_packages')
    .update({
      status:              'queued',
      generation_error:    null,
      last_error_message:  null,
      cancel_requested:    false,
      cancel_requested_at: null,
      cancelled_at:        null,
      frames_done:         existingDone,
      updated_at:          new Date().toISOString(),
    })
    .eq('id', packageId)

  console.info(`[p360:generate/route] pkg=${packageId} queued (was: ${currentStatus}), verifying provider…`)

  // ── Verify AI provider is configured ────────────────────────────────────────
  // Checked AFTER the status update so failures land in DB as 'failed' (not 'draft').
  const provider = getP360Provider()
  if (!provider) {
    const errMsg = 'AI image generation is not configured. Add GEMINI_API_KEY to your Vercel environment variables (Settings → Environment Variables).'
    await db.from('product_360_packages').update({
      status:             'failed',
      generation_error:   errMsg,
      last_error_message: errMsg,
      updated_at:         new Date().toISOString(),
    }).eq('id', packageId)
    console.error(`[p360:generate/route] pkg=${packageId} — provider not configured, marked failed`)
    return NextResponse.json({
      ok: false,
      error: {
        type:      'auth_error',
        title:     'AI not configured',
        message:   errMsg,
        retryable: false,
      },
    }, { status: 503 })
  }

  console.info(`[p360:generate/route] pkg=${packageId} provider="${provider.name}" model="${provider.model}", starting…`)

  // ── Run generation synchronously ────────────────────────────────────────────
  const result = await generatePackage(packageId)

  // ── User-requested cancellation ───────────────────────────────────────────
  if (result.cancelled) {
    console.info(`[p360:generate/route] pkg=${packageId} — generation stopped by user (${result.framesGenerated} frames saved)`)
    return NextResponse.json({
      ok: true,
      data: {
        status:          'cancelled',
        packageId,
        framesGenerated: result.framesGenerated,
        message:         `Generation stopped. ${result.framesGenerated} frame${result.framesGenerated !== 1 ? 's' : ''} were saved.`,
      },
    })
  }

  // ── 429 quota pause ────────────────────────────────────────────────────────
  if (result.pausedForQuota) {
    return NextResponse.json({
      ok: false,
      error: {
        type:            'quota_exceeded',
        title:           'Image generation quota reached',
        message:         result.errorMessage ?? 'Quota exceeded. Generation paused.',
        retryable:       true,
        framesGenerated: result.framesGenerated,
        retryAt:         result.retryAt ?? null,
      },
    }, { status: 429 })
  }

  if (!result.success) {
    console.error(`[p360:generate/route] pkg=${packageId} failed: ${result.errorMessage}`)
    return NextResponse.json({
      ok: false,
      error: {
        type:      'unknown',
        title:     'Generation failed',
        message:   result.errorMessage ?? 'Generation failed',
        retryable: false,
      },
    }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    data: {
      status:          'ready',
      packageId,
      framesGenerated: result.framesGenerated,
      previewUrl:      result.previewUrl ?? null,
    },
  })
}
