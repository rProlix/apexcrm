// app/api/product-360/packages/[packageId]/repair/route.ts
//
// POST — Repair a stuck, failed, or blueprint-broken 360° package.
//
// What it does:
//   1. Validates auth + tenant
//   2. Fetches package and product separately (no FK ambiguity)
//   3. Normalizes + saves scene_blueprint (fixes the "vessel" crash)
//   4. Creates any missing frame rows (0 … target_frame_count-1)
//   5. Resets frames stuck in 'generating' for > 10 minutes → 'queued'
//   6. Clears cancel_requested if package is not 'cancelled'
//   7. Recalculates frames_done + progress_percent from actual completed rows
//   8. If the package failed due to a missing blueprint / vessel, sets status → 'queued'
//   9. Returns a full diagnostic JSON

import { NextRequest, NextResponse }      from 'next/server'
import { resolveP360ApiUser }             from '@/lib/product-360/auth'
import { getSupabaseServerClient }        from '@/lib/supabase/server'
import { normalizeProductSubject }        from '@/lib/ai/360/normalizeProduct'
import {
  normalizeSceneBlueprint,
  buildLockedGenerationPrompt,
} from '@/lib/ai/360/buildLockedFramePrompt'
import type { P360GenerationConfig }      from '@/lib/ai/360/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 30

type Ctx = { params: Promise<{ packageId: string }> }

const UUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STALE_MS  = 10 * 60 * 1000   // 10 minutes

// Statuses eligible for repair + resume
const REPAIRABLE = new Set(['failed', 'queued', 'generating', 'processing', 'paused_quota'])

export async function POST(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params

  if (!packageId || !UUID_RE.test(packageId)) {
    return NextResponse.json({ ok: false, errorMessage: 'Invalid packageId' }, { status: 400 })
  }

  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ ok: false, errorMessage: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ ok: false, errorMessage: 'Only owners and admins may repair packages' }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* optional */ }

  const tenantId = user.isOwner
    ? (body.tenantId as string | undefined) ?? user.tenantId
    : user.tenantId

  if (!tenantId) {
    return NextResponse.json({ ok: false, errorMessage: 'Could not resolve tenant' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // ── 1. Load package ─────────────────────────────────────────────────────
  const { data: pkgRaw, error: pkgErr } = await db
    .from('product_360_packages')
    .select('*')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (pkgErr || !pkgRaw) {
    return NextResponse.json({
      ok:           false,
      errorMessage: pkgErr ? `DB error: ${pkgErr.message}` : 'Package not found',
    }, { status: pkgErr ? 500 : 404 })
  }

  const pkg           = pkgRaw as Record<string, unknown>
  const currentStatus = (pkg.status as string) ?? 'draft'
  const productId     = (pkg.product_id as string | null) ?? null

  if (currentStatus === 'archived') {
    return NextResponse.json({
      ok: false, errorMessage: 'Package is archived — unarchive it first',
    }, { status: 409 })
  }

  if (currentStatus === 'cancelled') {
    return NextResponse.json({
      ok: false, errorMessage: 'Package is cancelled — cannot repair a cancelled package',
    }, { status: 409 })
  }

  const diagnostics: Record<string, unknown> = {
    packageId,
    currentStatus,
    productId,
    repairSteps: [] as string[],
  }
  const steps = diagnostics.repairSteps as string[]

  // ── 2. Load product ──────────────────────────────────────────────────────
  let productName = (pkg.name as string) || 'Product'
  let productDesc = (pkg.description as string) || ''
  let productCat  = (pkg.category_preset as string | null) ?? null

  if (productId) {
    const { data: productRaw } = await db
      .from('products')
      .select('name, description, category')
      .eq('id', productId)
      .maybeSingle()

    if (productRaw) {
      productName = (productRaw.name        as string) || productName
      productDesc = (productRaw.description as string) || productDesc
      productCat  = (productRaw.category    as string | null) ?? productCat
      steps.push(`Loaded product: "${productName}"`)
    } else {
      steps.push('Product not found in DB (package.name used as fallback)')
    }
  } else {
    steps.push('No product_id on package — using package.name as fallback')
  }

  // ── 3. Normalize + save blueprint ────────────────────────────────────────
  const totalFrames = Math.max(1,
    ((pkg.target_frame_count as number) || 12)
  )

  const genConfig: P360GenerationConfig = {
    frameCount:          totalFrames,
    lightingPreset:      (pkg.lighting_preset    as string | null) ?? null,
    backgroundPreset:    (pkg.background_preset  as string | null) ?? null,
    categoryPreset:      productCat,
    cameraPreset:        (pkg.camera_preset      as string | null) ?? null,
    cameraDistance:      (pkg.camera_distance    as number | null) ?? null,
    cameraHeight:        (pkg.camera_height      as number | null) ?? null,
    fov:                 (pkg.fov                as number | null) ?? null,
    shadowStrength:      (pkg.shadow_strength    as number | null) ?? null,
    reflectionIntensity: (pkg.reflection_intensity as number | null) ?? null,
    turnDirection:       (pkg.turn_direction as string) === 'counter_clockwise' ? 'counter_clockwise' : 'clockwise',
    outputWidth:         (pkg.output_width  as number | null) ?? null,
    outputHeight:        (pkg.output_height as number | null) ?? null,
    generationNotes:     (pkg.generation_notes as string | null) ?? null,
    customPrompt:        (pkg.generation_prompt as string | null) ?? null,
  }

  const subject   = normalizeProductSubject(productName, productDesc, productCat)
  const blueprint = normalizeSceneBlueprint(pkg.scene_blueprint, subject, genConfig)

  const rawBp           = pkg.scene_blueprint as Record<string, unknown> | null
  const blueprintBroken = !rawBp || typeof rawBp !== 'object'
    || !rawBp.subject
    || !(rawBp.subject as Record<string, unknown>).vessel

  diagnostics.blueprint = {
    wasBroken:     blueprintBroken,
    normalizedVessel: blueprint.subject.vessel,
    normalizedName:   blueprint.subject.name,
  }

  if (blueprintBroken) {
    await db.from('product_360_packages').update({
      scene_blueprint: blueprint,
      updated_at:      new Date().toISOString(),
    }).eq('id', packageId)
    steps.push(`Blueprint repaired — vessel="${blueprint.subject.vessel}"`)
  } else {
    steps.push(`Blueprint OK — vessel="${blueprint.subject.vessel}"`)
  }

  // Repair locked generation prompt if missing / too short
  const existingLocked = (pkg.locked_generation_prompt as string | null) ?? ''
  if (existingLocked.trim().length < 50) {
    const lockedPrompt = buildLockedGenerationPrompt(subject, genConfig, blueprint)
    await db.from('product_360_packages').update({
      locked_generation_prompt: lockedPrompt,
      updated_at:               new Date().toISOString(),
    }).eq('id', packageId)
    steps.push('Rebuilt locked_generation_prompt (was missing or too short)')
  } else {
    steps.push('locked_generation_prompt OK')
  }

  // ── 4. Load existing frame rows ──────────────────────────────────────────
  const { data: existingFrames } = await db
    .from('product_360_frames')
    .select('frame_index, image_url, status, generation_started_at')
    .eq('package_id', packageId)
    .order('frame_index', { ascending: true })

  const frameMap = new Map<number, { image_url: string | null; status: string; generation_started_at: string | null }>()
  for (const f of existingFrames ?? []) {
    frameMap.set(f.frame_index as number, {
      image_url:             f.image_url,
      status:                f.status ?? 'pending',
      generation_started_at: f.generation_started_at,
    })
  }

  // ── 5. Create missing frame rows ─────────────────────────────────────────
  const tenantIdPkg = (pkg.tenant_id as string) ?? tenantId
  let missingCount  = 0
  for (let i = 0; i < totalFrames; i++) {
    if (!frameMap.has(i)) {
      await db.from('product_360_frames').upsert({
        package_id:   packageId,
        tenant_id:    tenantIdPkg,
        product_id:   productId,
        frame_index:  i,
        angle_degrees: Math.round((360 / totalFrames) * i),
        status:       'queued',
        updated_at:   new Date().toISOString(),
      }, { onConflict: 'package_id,frame_index' })
      missingCount++
    }
  }
  if (missingCount > 0) steps.push(`Created ${missingCount} missing frame rows`)

  // ── 6. Reset stale generating frames ────────────────────────────────────
  let staleCount = 0
  const staleThreshold = new Date(Date.now() - STALE_MS).toISOString()
  for (const [idx, fr] of frameMap.entries()) {
    if (fr.status === 'generating') {
      const startedAt = fr.generation_started_at
      if (!startedAt || startedAt < staleThreshold) {
        await db.from('product_360_frames').update({
          status: 'queued', updated_at: new Date().toISOString(),
        }).eq('package_id', packageId).eq('frame_index', idx)
        staleCount++
      }
    }
  }
  if (staleCount > 0) steps.push(`Reset ${staleCount} stale generating frames → queued`)

  // ── 7. Clear cancel_requested ────────────────────────────────────────────
  if (pkg.cancel_requested) {
    await db.from('product_360_packages').update({
      cancel_requested: false,
      updated_at:       new Date().toISOString(),
    }).eq('id', packageId)
    steps.push('Cleared cancel_requested flag')
  }

  // ── 8. Recalculate progress ──────────────────────────────────────────────
  // Re-fetch frames after any upserts
  const { data: framesAfter } = await db
    .from('product_360_frames')
    .select('frame_index, image_url')
    .eq('package_id', packageId)

  const completedFrames = ((framesAfter ?? []) as Array<{ frame_index: number; image_url: string | null }>)
    .filter(f => !!f.image_url)
  const framesDone      = completedFrames.length
  const progressPercent = Math.min(100, Math.round((framesDone / totalFrames) * 100))

  diagnostics.frames = {
    total:      totalFrames,
    completed:  framesDone,
    progress:   progressPercent,
    missingCreated: missingCount,
    staleReset: staleCount,
  }

  // ── 9. Decide new package status + update ────────────────────────────────
  const isBlueprintFailure = blueprintBroken
    || (typeof pkg.generation_error === 'string' && (pkg.generation_error as string).toLowerCase().includes('vessel'))
    || (typeof pkg.last_error_message === 'string' && (pkg.last_error_message as string).toLowerCase().includes('vessel'))

  const shouldResume = REPAIRABLE.has(currentStatus)
    && (blueprintBroken || isBlueprintFailure || currentStatus === 'generating')

  const newStatus = shouldResume ? 'queued' : currentStatus

  const pkgUpdate: Record<string, unknown> = {
    frames_done:      framesDone,
    progress_percent: progressPercent,
    updated_at:       new Date().toISOString(),
  }

  if (shouldResume) {
    pkgUpdate.status             = 'queued'
    pkgUpdate.generation_error   = null
    pkgUpdate.last_error_message = null
    pkgUpdate.last_error_at      = null
    pkgUpdate.cancel_requested   = false
    steps.push(`Package status reset to 'queued' — ready to resume generation`)
  } else {
    steps.push(`Package status unchanged: "${currentStatus}"`)
  }

  const { error: updateErr } = await db
    .from('product_360_packages')
    .update(pkgUpdate)
    .eq('id', packageId)

  if (updateErr) {
    steps.push(`WARNING: progress update failed — ${updateErr.message}`)
  }

  diagnostics.newStatus        = newStatus
  diagnostics.readyToResume    = shouldResume
  diagnostics.howToResume      = shouldResume
    ? `Click "Resume Generation" or call POST /api/product-360/packages/${packageId}/generate`
    : null

  return NextResponse.json({
    ok:          true,
    packageId,
    newStatus,
    readyToResume: shouldResume,
    diagnostics,
    repairSteps: steps,
    message: shouldResume
      ? 'Package repaired and queued. Click "Resume Generation" to continue.'
      : `Package examined. ${steps.length} step(s) performed. Status: ${currentStatus}.`,
  })
}
