// app/api/product-360/packages/[packageId]/pump/route.ts
//
// POST — process exactly ONE pending frame for a 360° package.
//
// Design:
//   Each call completes one Imagen frame. The client calls this endpoint
//   repeatedly until { ok: true, data: { hasMore: false } } is returned.
//   This architecture is safe on all Vercel plans (no single call exceeds 120 s).
//
// Error contract:
//   { ok: false, packageId, errorCode, errorMessage, errorDetails, failedStage }
//   HTTP status codes:
//     400  invalid input         404  not found
//     401  unauthenticated       409  wrong state (cancelled/archived)
//     429  quota exceeded        500  server/provider/storage failure

import { NextRequest, NextResponse }       from 'next/server'
import { resolveP360ApiUser }              from '@/lib/product-360/auth'
import { getSupabaseServerClient }         from '@/lib/supabase/server'
import { requireP360Provider }             from '@/lib/ai/360/provider'
import { ImagenApiError }                  from '@/lib/ai/360/imagenProvider'
import { uploadFrame }                     from '@/lib/product-360/storage'
import { finalizePackage }                 from '@/lib/product-360/finalize'
import { normalizeAiError }                from '@/lib/ai/normalizeAiError'
import { normalizeProductSubject }         from '@/lib/ai/360/normalizeProduct'
import {
  normalizeSceneBlueprint,
  buildLockedGenerationPrompt,
  buildMasterFramePrompt,
  buildLockedFramePrompt,
  getFrameAngle,
  getShotDirection,
} from '@/lib/ai/360/buildLockedFramePrompt'
import type { P360GenerationConfig } from '@/lib/ai/360/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 120   // one Imagen call: 10–60 s on average

type Ctx = { params: Promise<{ packageId: string }> }

const PUMPABLE = new Set([
  'queued', 'planning', 'generating', 'processing', 'paused_quota', 'failed',
])

// ─── Structured error helper ──────────────────────────────────────────────────

function pumpError(opts: {
  packageId:    string
  status:       number
  errorCode:    string
  errorMessage: string
  errorDetails?: string
  failedStage:  string
}) {
  console.error(
    `[P360] pump:error stage=${opts.failedStage} code=${opts.errorCode} msg="${opts.errorMessage}"`,
  )
  return NextResponse.json({
    ok:           false,
    packageId:    opts.packageId,
    errorCode:    opts.errorCode,
    errorMessage: opts.errorMessage,
    errorDetails: opts.errorDetails ?? null,
    failedStage:  opts.failedStage,
  }, { status: opts.status })
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params

  console.info(`[P360] pump:start packageId=${packageId}`)

  // ── Validate packageId ────────────────────────────────────────────────────
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!packageId || !UUID_RE.test(packageId)) {
    return pumpError({ packageId: packageId ?? '', status: 400, errorCode: 'invalid_package_id',
      errorMessage: 'packageId must be a valid UUID', failedStage: 'validation' })
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const user = await resolveP360ApiUser(req)
  if (!user) {
    return pumpError({ packageId, status: 401, errorCode: 'auth_error',
      errorMessage: 'Unauthorized', failedStage: 'auth' })
  }
  if (user.role !== 'owner' && user.role !== 'admin') {
    return pumpError({ packageId, status: 403, errorCode: 'auth_error',
      errorMessage: 'Only owners and admins may pump generation', failedStage: 'auth' })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* body is optional */ }

  const tenantId = user.isOwner
    ? (body.tenantId as string | undefined) ?? user.tenantId
    : user.tenantId

  if (!tenantId) {
    return pumpError({ packageId, status: 400, errorCode: 'missing_tenant',
      errorMessage: 'Could not resolve tenant from request', failedStage: 'auth' })
  }

  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // ── Load package (select * avoids 400 from missing columns) ──────────────
  const { data: pkgRaw, error: pkgErr } = await db
    .from('product_360_packages')
    .select('*')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (pkgErr) {
    console.error(`[P360] pump:error stage=package-load supabase_error="${pkgErr.message}"`)
    // Try to record the error on the package (may fail silently)
    await db.from('product_360_packages').update({
      last_error_message: `DB error loading package: ${pkgErr.message}`,
      last_error_at:      new Date().toISOString(),
    }).eq('id', packageId)
    return pumpError({ packageId, status: 500, errorCode: 'db_error',
      errorMessage: `Database error loading package: ${pkgErr.message}`,
      errorDetails: pkgErr.details ?? pkgErr.hint ?? null,
      failedStage:  'package-load' })
  }
  if (!pkgRaw) {
    return pumpError({ packageId, status: 404, errorCode: 'not_found',
      errorMessage: 'Package not found or access denied', failedStage: 'package-load' })
  }

  // Safely read typed fields from the raw row
  const pkg = pkgRaw as Record<string, unknown>
  const currentStatus      = (pkg.status             as string)  ?? 'draft'
  const cancelRequested    = !!(pkg.cancel_requested)
  const tenantIdPkg        = (pkg.tenant_id          as string)  ?? tenantId
  const productId          = (pkg.product_id         as string | null) ?? null
  const retryCountPkg      = ((pkg.retry_count       as number)  ?? 0)

  console.info(
    `[P360] pump:package-loaded status=${currentStatus} product_id=${productId} tenant_id=${tenantIdPkg}`,
  )

  // ── Already in terminal state? ────────────────────────────────────────────
  if (currentStatus === 'ready' || currentStatus === 'completed') {
    return NextResponse.json({
      ok: true, packageId, hasMore: false,
      packageStatus: currentStatus, progressPercent: 100,
      message: 'Package generation is already complete.',
    })
  }
  if (currentStatus === 'cancelled') {
    return NextResponse.json({
      ok: true, packageId, hasMore: false, packageStatus: 'cancelled',
      progressPercent: (pkg.progress_percent as number) ?? 0,
      message: 'Package was cancelled.',
    })
  }
  if (currentStatus === 'archived') {
    return pumpError({ packageId, status: 409, errorCode: 'package_archived',
      errorMessage: 'Package is archived and cannot be generated', failedStage: 'state-check' })
  }

  // ── Cancel check ─────────────────────────────────────────────────────────
  if (cancelRequested) {
    await db.from('product_360_packages').update({
      status:       'cancelled',
      cancelled_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    }).eq('id', packageId)
    return NextResponse.json({
      ok: true, packageId, hasMore: false, packageStatus: 'cancelled',
      progressPercent: (pkg.progress_percent as number) ?? 0,
      message: 'Package was cancelled by request.',
    })
  }

  if (!PUMPABLE.has(currentStatus)) {
    return pumpError({ packageId, status: 409, errorCode: 'invalid_state',
      errorMessage: `Package status "${currentStatus}" is not pumpable. Valid statuses: ${[...PUMPABLE].join(', ')}`,
      failedStage: 'state-check' })
  }

  // ── Verify product is attached ────────────────────────────────────────────
  if (!productId) {
    const msg = 'Package has no product attached — cannot generate'
    await db.from('product_360_packages').update({
      status: 'failed', generation_error: msg, last_error_message: msg,
      last_error_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', packageId)
    return pumpError({ packageId, status: 422, errorCode: 'no_product',
      errorMessage: msg, failedStage: 'state-check' })
  }

  // ── Provider check ────────────────────────────────────────────────────────
  let provider
  try {
    provider = requireP360Provider()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI provider not configured'
    await db.from('product_360_packages').update({
      status: 'failed', generation_error: msg, last_error_message: msg,
      last_error_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', packageId)
    return pumpError({ packageId, status: 503, errorCode: 'provider_not_configured',
      errorMessage: msg, failedStage: 'provider-init' })
  }

  // ── Load product (separate query — avoids FK ambiguity, no column assumptions) ─
  //    Only request columns that exist in the base products table.
  const { data: productRaw } = await db
    .from('products')
    .select('name, description, category')
    .eq('id', productId)
    .maybeSingle()

  const productName  = (productRaw?.name        as string | null) || (pkg.name as string) || 'Product'
  const productDesc  = (productRaw?.description as string | null) || (pkg.description as string) || ''
  const productCat   = (productRaw?.category    as string | null) ?? null

  console.info(`[P360] pump:product-loaded name="${productName}"`)

  // ── Build normalized subject + blueprint ──────────────────────────────────
  //
  //   CRITICAL: never cast pkg.scene_blueprint to SceneBlueprint directly.
  //   Old/partial blueprints stored in the DB will have undefined nested fields
  //   (e.g. missing subject.vessel), causing "Cannot read properties of undefined"
  //   crashes in the prompt builders.
  //
  //   normalizeSceneBlueprint() deep-merges the stored blob with safe defaults
  //   derived from the current product, so every field is always populated.

  const lightingPreset     = (pkg.lighting_preset    as string | null) ?? null
  const backgroundPreset   = (pkg.background_preset  as string | null) ?? null
  const categoryPreset     = (pkg.category_preset    as string | null) ?? productCat
  const cameraPreset       = (pkg.camera_preset      as string | null) ?? null
  const totalFrames        = Math.min(
    ((pkg.target_frame_count as number) || 12),
    parseInt(process.env.MAX_360_FRAMES_PER_PACKAGE ?? '24', 10) || 24,
  )

  const genConfig: P360GenerationConfig = {
    frameCount:          totalFrames,
    lightingPreset,
    backgroundPreset,
    categoryPreset,
    cameraPreset,
    cameraDistance:      (pkg.camera_distance    as number | null) ?? null,
    cameraHeight:        (pkg.camera_height      as number | null) ?? null,
    fov:                 (pkg.fov                as number | null) ?? null,
    shadowStrength:      (pkg.shadow_strength    as number | null) ?? null,
    reflectionIntensity: (pkg.reflection_intensity as number | null) ?? null,
    turnDirection:       (pkg.turn_direction as string) === 'counter_clockwise'
                           ? 'counter_clockwise' : 'clockwise',
    outputWidth:         (pkg.output_width  as number | null) ?? null,
    outputHeight:        (pkg.output_height as number | null) ?? null,
    generationNotes:     (pkg.generation_notes as string | null) ?? null,
    customPrompt:        (pkg.generation_prompt as string | null) ?? null,
  }

  const subject = normalizeProductSubject(productName, productDesc, categoryPreset)

  // Safe blueprint — never crashes on missing nested fields
  const blueprint = normalizeSceneBlueprint(pkg.scene_blueprint, subject, genConfig)

  console.info(
    `[P360] pump:blueprint-normalized hasVessel=${!!blueprint.subject.vessel} ` +
    `vessel="${blueprint.subject.vessel}" subject="${blueprint.subject.name}"`,
  )

  // Persist the repaired/normalized blueprint back to the DB if the stored one
  // was missing required nested fields (prevents repeated repair on each pump call).
  const rawBp = pkg.scene_blueprint as Record<string, unknown> | null
  const blueprintNeedsRepair = !rawBp
    || typeof rawBp !== 'object'
    || !rawBp.subject
    || !(rawBp.subject as Record<string, unknown>).vessel

  if (blueprintNeedsRepair) {
    console.info(`[P360] pump:blueprint-repair packageId=${packageId} — persisting repaired blueprint`)
    await db.from('product_360_packages').update({
      scene_blueprint: blueprint,
      updated_at:      new Date().toISOString(),
    }).eq('id', packageId)
  }

  // Build (or reuse stored) locked generation prompt
  const lockedPrompt: string =
    (typeof pkg.locked_generation_prompt === 'string' && (pkg.locked_generation_prompt as string).trim().length > 50)
      ? (pkg.locked_generation_prompt as string)
      : buildLockedGenerationPrompt(subject, genConfig, blueprint)

  // Persist locked prompt if it was missing
  if (!pkg.locked_generation_prompt || (pkg.locked_generation_prompt as string).trim().length < 50) {
    await db.from('product_360_packages').update({
      locked_generation_prompt: lockedPrompt,
      updated_at:               new Date().toISOString(),
    }).eq('id', packageId)
  }

  // ── Transition package to 'generating' ───────────────────────────────────
  if (currentStatus !== 'generating') {
    const { error: statusErr } = await db
      .from('product_360_packages')
      .update({ status: 'generating', updated_at: new Date().toISOString() })
      .eq('id', packageId)

    if (statusErr) {
      console.error(`[P360] pump:error stage=status-transition error="${statusErr.message}"`)
      return pumpError({ packageId, status: 500, errorCode: 'db_error',
        errorMessage: `Failed to transition package to generating: ${statusErr.message}`,
        errorDetails: statusErr.details ?? null,
        failedStage:  'status-transition' })
    }
  }

  // ── Find next frame to process ────────────────────────────────────────────
  const { data: existingFrames, error: framesErr } = await db
    .from('product_360_frames')
    .select('frame_index, image_url')
    .eq('package_id', packageId)
    .order('frame_index', { ascending: true })

  if (framesErr) {
    console.warn(`[P360] pump:warn stage=frames-load error="${framesErr.message}" (non-fatal, assuming 0 frames)`)
  }

  const frames = (existingFrames ?? []) as Array<{ frame_index: number; image_url: string | null }>
  const completedSet = new Set(frames.filter(f => !!f.image_url).map(f => f.frame_index))

  let nextFrameIndex = -1
  for (let i = 0; i < totalFrames; i++) {
    if (!completedSet.has(i)) { nextFrameIndex = i; break }
  }

  // ── All complete? Finalize ────────────────────────────────────────────────
  if (nextFrameIndex === -1) {
    console.info(`[P360] pump:package-progress all ${totalFrames} frames complete — finalizing`)
    await db.from('product_360_packages').update({
      status: 'processing', frames_done: totalFrames, progress_percent: 100,
      frame_count: totalFrames, updated_at: new Date().toISOString(),
    }).eq('id', packageId)

    const fin = await finalizePackage(packageId)
    await db.from('product_360_packages').update({
      generation_completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', packageId)

    if (!fin.success) {
      return pumpError({ packageId, status: 500, errorCode: 'finalize_failed',
        errorMessage: fin.errorMessage ?? 'Failed to finalize package',
        failedStage:  'finalize' })
    }

    return NextResponse.json({
      ok: true, packageId, hasMore: false, done: true,
      packageStatus: 'ready', progressPercent: 100, framesDone: totalFrames, totalFrames,
      previewUrl: fin.previewUrl ?? null,
      message: `All ${totalFrames} frames generated. Package is ready.`,
    })
  }

  // ── Generate the selected frame ───────────────────────────────────────────
  const isMasterFrame = nextFrameIndex === 0
  const angleDeg      = getFrameAngle(nextFrameIndex, totalFrames)
  const shotDirection = getShotDirection(angleDeg)

  const framePrompt = isMasterFrame
    ? buildMasterFramePrompt(subject, genConfig, blueprint)
    : buildLockedFramePrompt(lockedPrompt, angleDeg, nextFrameIndex, totalFrames, shotDirection)

  console.info(
    `[P360] pump:frame-selected frameIndex=${nextFrameIndex} angle=${angleDeg}° isMaster=${isMasterFrame}`,
  )

  // Mark frame as 'generating' before API call
  await db.from('product_360_frames').upsert({
    package_id:            packageId,
    tenant_id:             tenantIdPkg,
    product_id:            productId,
    frame_index:           nextFrameIndex,
    angle_degrees:         angleDeg,
    status:                'generating',
    generation_started_at: new Date().toISOString(),
    is_master_frame:       isMasterFrame,
    updated_at:            new Date().toISOString(),
  }, { onConflict: 'package_id,frame_index' })

  // Load master frame as reference for non-master frames
  let masterBase64: string | undefined, masterMime = 'image/png'
  const storedMasterUrl = (pkg.master_frame_url as string | null) ?? null
  if (!isMasterFrame && storedMasterUrl) {
    try {
      const res = await fetch(storedMasterUrl)
      if (res.ok) {
        masterBase64 = Buffer.from(await res.arrayBuffer()).toString('base64')
        masterMime   = res.headers.get('content-type') ?? 'image/png'
      }
    } catch (e) {
      console.warn(`[P360] pump:warn failed to fetch master reference: ${e instanceof Error ? e.message : e}`)
    }
  }

  try {
    console.info(`[P360] pump:provider:start model="${provider.model}" frame=${nextFrameIndex}`)

    const result = await provider.generateFrame({
      prompt:                 framePrompt,
      width:                  genConfig.outputWidth  ?? 1024,
      height:                 genConfig.outputHeight ?? 1024,
      referenceImageBase64:   masterBase64,
      referenceImageMimeType: masterMime,
    })

    console.info(`[P360] pump:provider:success frame=${nextFrameIndex}`)

    const mimeType = result.mimeType ?? 'image/png'
    const ext      = mimeType.includes('jpeg') ? 'jpg' : 'png'
    let   uploadedUrl: string, storagePath: string

    const storageBucket = process.env.P360_STORAGE_BUCKET ?? 'spin-360-assets'
    const storagePfx    = `tenants/${tenantIdPkg}/360/${productId}/packages/${packageId}/frames/frame_${String(nextFrameIndex).padStart(3, '0')}.${ext}`
    console.info(`[P360] pump:storage:start bucket="${storageBucket}" path="${storagePfx}"`)

    if (result.imageBuffer) {
      const up = await uploadFrame({
        tenantId: tenantIdPkg, productId, packageId, frameIndex: nextFrameIndex,
        buffer: result.imageBuffer, contentType: mimeType, ext,
      })
      uploadedUrl = up.imageUrl; storagePath = up.storagePath
    } else if (result.imageUrl) {
      const fetchRes = await fetch(result.imageUrl)
      if (!fetchRes.ok) throw new Error(`Remote frame fetch failed: HTTP ${fetchRes.status} for ${result.imageUrl}`)
      const buf = Buffer.from(await fetchRes.arrayBuffer())
      const up  = await uploadFrame({
        tenantId: tenantIdPkg, productId, packageId, frameIndex: nextFrameIndex,
        buffer: buf, contentType: fetchRes.headers.get('content-type') ?? mimeType, ext,
      })
      uploadedUrl = up.imageUrl; storagePath = up.storagePath
    } else {
      throw new Error('Provider returned neither image buffer nor image URL')
    }

    console.info(`[P360] pump:storage:success imageUrl="${uploadedUrl.slice(0, 80)}…"`)
    console.info(`[P360] pump:frame-completed frameIndex=${nextFrameIndex}`)

    // Save completed frame
    await db.from('product_360_frames').upsert({
      package_id:              packageId,
      tenant_id:               tenantIdPkg,
      product_id:              productId,
      frame_index:             nextFrameIndex,
      angle_degrees:           angleDeg,
      image_url:               uploadedUrl,
      storage_path:            storagePath,
      status:                  'completed',
      prompt_used:             framePrompt.slice(0, 4000),
      is_master_frame:         isMasterFrame,
      generation_attempt:      1,
      alt_text:                `${blueprint.subject.name} – ${shotDirection} view`,
      generation_finished_at:  new Date().toISOString(),
      updated_at:              new Date().toISOString(),
    }, { onConflict: 'package_id,frame_index' })

    const newDone         = completedSet.size + 1
    const progressPercent = Math.min(100, Math.round((newDone / totalFrames) * 100))
    const remainingFrames = totalFrames - newDone
    const hasMore         = remainingFrames > 0

    console.info(
      `[P360] pump:package-progress framesDone=${newDone} total=${totalFrames} progress=${progressPercent}%`,
    )

    // Update package progress + master frame reference
    const pkgUpdate: Record<string, unknown> = {
      frames_done:               newDone,
      progress_percent:          progressPercent,
      last_generated_at:         new Date().toISOString(),
      last_generation_heartbeat: new Date().toISOString(),
      updated_at:                new Date().toISOString(),
    }
    if (isMasterFrame) {
      pkgUpdate.master_frame_url       = uploadedUrl
      pkgUpdate.master_frame_generated = true
    }
    await db.from('product_360_packages').update(pkgUpdate).eq('id', packageId)

    // All frames done → finalize
    if (!hasMore) {
      await db.from('product_360_packages').update({
        status: 'processing', frame_count: totalFrames, updated_at: new Date().toISOString(),
      }).eq('id', packageId)
      const fin = await finalizePackage(packageId)
      await db.from('product_360_packages').update({
        generation_completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', packageId)
      if (!fin.success) {
        return pumpError({ packageId, status: 500, errorCode: 'finalize_failed',
          errorMessage: fin.errorMessage ?? 'Finalize failed',
          failedStage:  'finalize' })
      }
      return NextResponse.json({
        ok: true, packageId, hasMore: false, done: true,
        packageStatus: 'ready', progressPercent: 100, framesDone: totalFrames, totalFrames,
        previewUrl: fin.previewUrl ?? null,
        processedFrameIndex: nextFrameIndex,
        imageUrl: uploadedUrl,
        message: `Generation complete. ${totalFrames} frames ready.`,
      })
    }

    return NextResponse.json({
      ok: true, packageId, hasMore: true, done: false,
      packageStatus:       'generating',
      progressPercent,
      framesDone:          newDone,
      totalFrames,
      remainingFrames,
      processedFrameIndex: nextFrameIndex,
      imageUrl:            uploadedUrl,
      message: `Frame ${newDone} of ${totalFrames} generated.`,
    })

  } catch (err) {
    // ── Quota exceeded ────────────────────────────────────────────────────
    if (err instanceof ImagenApiError && err.statusCode === 429) {
      const normalized = normalizeAiError(429, err.message)
      const retryAt    = normalized.retryAfter
        ? new Date(Date.now() + normalized.retryAfter * 1000).toISOString()
        : null

      await db.from('product_360_frames').update({
        status: 'pending', updated_at: new Date().toISOString(),
      }).eq('package_id', packageId).eq('frame_index', nextFrameIndex)

      await db.from('product_360_packages').update({
        status:             'paused_quota',
        generation_error:   normalized.message,
        last_error_type:    'quota_exceeded',
        last_error_message: normalized.message,
        last_error_at:      new Date().toISOString(),
        next_retry_at:      retryAt,
        retry_count:        retryCountPkg + 1,
        updated_at:         new Date().toISOString(),
      }).eq('id', packageId)

      console.warn(`[P360] pump:quota packageId=${packageId} frame=${nextFrameIndex} retryAt=${retryAt}`)

      return NextResponse.json({
        ok:           false,
        packageId,
        errorCode:    'quota_exceeded',
        errorMessage: normalized.message,
        errorDetails: `Paused at frame ${nextFrameIndex}. Retry after: ${retryAt ?? 'unknown'}`,
        failedStage:  'provider',
        retryAt,
      }, { status: 429 })
    }

    // ── General failure ───────────────────────────────────────────────────
    const errMsg = err instanceof Error ? err.message : String(err)
    const errStack = err instanceof Error ? (err.stack ?? '').split('\n').slice(0, 5).join('\n') : ''

    console.error(
      `[P360] pump:error stage=frame-generation packageId=${packageId} frame=${nextFrameIndex} error="${errMsg}"`,
    )

    // Classify the error for better UX
    let friendlyMessage = errMsg
    if (errMsg.includes('text output') || errMsg.includes('text only')) {
      friendlyMessage = 'The AI model only supports text, not image generation. Check IMAGEN_MODEL env var.'
    } else if (errMsg.includes('GEMINI_API_KEY') || errMsg.includes('Missing')) {
      friendlyMessage = 'Missing API key. Add GEMINI_API_KEY to your environment variables.'
    } else if (errMsg.includes('bucket') || errMsg.includes('Storage')) {
      friendlyMessage = `Storage upload failed. ${errMsg}`
    } else if (errMsg.includes('403') || errMsg.includes('access denied') || errMsg.includes('PERMISSION_DENIED')) {
      friendlyMessage = 'Imagen API access denied. Ensure your API key has the Imagen API enabled in Google Cloud Console.'
    }

    await db.from('product_360_frames').update({
      status:        'failed',
      error_message: errMsg,
      updated_at:    new Date().toISOString(),
    }).eq('package_id', packageId).eq('frame_index', nextFrameIndex)

    await db.from('product_360_packages').update({
      status:             'failed',
      generation_error:   friendlyMessage,
      last_error_message: friendlyMessage,
      last_error_details: errStack || null,
      last_error_at:      new Date().toISOString(),
      updated_at:         new Date().toISOString(),
    }).eq('id', packageId)

    return NextResponse.json({
      ok:           false,
      packageId,
      errorCode:    'frame_generation_failed',
      errorMessage: friendlyMessage,
      errorDetails: errStack || null,
      failedStage:  'provider',
    }, { status: 500 })
  }
}
