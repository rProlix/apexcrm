// app/api/product-360/packages/[packageId]/generate/route.ts
//
// POST — start generation for a package.
//
// This route AWAITS generatePackage() synchronously so the Vercel function
// stays alive until generation completes. maxDuration = 300 (5 min) gives
// enough headroom for 24 Gemini frames.
//
// Fire-and-forget was removed: it caused packages to stay stuck in "queued"
// when the function was killed by Vercel before the DB finalization ran.

import { NextRequest, NextResponse } from 'next/server'
import { resolveP360ApiUser }        from '@/lib/product-360/auth'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { generatePackage }           from '@/lib/product-360/generationService'
import { getP360Provider }           from '@/lib/ai/360/provider'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300  // seconds — Vercel Pro/Enterprise

type Ctx = { params: Promise<{ packageId: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* body optional */ }

  const tenantId = user.isOwner
    ? (body.tenantId as string | undefined) ?? user.tenantId
    : user.tenantId

  if (!tenantId) return NextResponse.json({ error: 'Could not resolve tenant' }, { status: 400 })

  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // ── Validate package belongs to this tenant ─────────────────────────────
  const { data: pkg } = await db
    .from('product_360_packages')
    .select('id, status, product_id')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })

  const currentStatus = (pkg as Record<string, unknown>).status as string
  if (currentStatus === 'generating' || currentStatus === 'processing') {
    return NextResponse.json({ error: 'Generation already in progress' }, { status: 409 })
  }

  // ── Verify AI provider is configured ───────────────────────────────────
  const provider = getP360Provider()
  if (!provider) {
    return NextResponse.json({
      error: 'AI generation is not configured. Set GEMINI_API_KEY in environment variables.',
    }, { status: 503 })
  }

  // ── Set queued immediately so the UI sees state change ──────────────────
  await db
    .from('product_360_packages')
    .update({
      status:           'queued',
      generation_error: null,
      frames_done:      0,
      progress_percent: 0,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', packageId)

  console.info(`[p360:generate/route] pkg=${packageId} queued, starting generation…`)

  // ── Run generation synchronously so finalization is guaranteed ──────────
  const result = await generatePackage(packageId)

  if (!result.success) {
    console.error(`[p360:generate/route] pkg=${packageId} failed: ${result.errorMessage}`)
    return NextResponse.json({
      success:    false,
      status:     'failed',
      error:      result.errorMessage ?? 'Generation failed',
      packageId,
    }, { status: 500 })
  }

  return NextResponse.json({
    success:        true,
    status:         'ready',
    packageId,
    framesGenerated: result.framesGenerated,
    previewUrl:     result.previewUrl ?? null,
  })
}
