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
import { ImagenApiError }                  from '@/lib/ai/360/imagenProvider'
import { uploadFrame }                     from '@/lib/product-360/storage'
import { finalizePackage }                 from '@/lib/product-360/finalize'
import { normalizeAiError }                from '@/lib/ai/normalizeAiError'
import { normalizeProductSubject }         from '@/lib/ai/360/normalizeProduct'
import { getProduct360Provider }           from '@/lib/product-360/providers'
import {
  buildIdentityBlueprint,
  getIdentityBlueprint,
  serializeIdentityBlueprintToTextVariables,
} from '@/lib/product-360/identityBlueprint'
import { buildLeonardoDiagnostic }         from '@/lib/product-360/providers/leonardoProvider'
import {
  normalizeSceneBlueprint,
  enrichBlueprintWithAnalysis,
  buildLockedGenerationPrompt,
  buildMasterFramePrompt,
  buildLockedFramePrompt,
  getFrameAngle,
  getShotDirection,
} from '@/lib/ai/360/buildLockedFramePrompt'
import { analyzeMasterFrame }                from '@/lib/ai/360/masterFrameAnalyzer'
import { buildSceneContract }                from '@/lib/ai/360/sceneContractBuilder'
import {
  validateFrameAgainstLockedScene,
  shouldValidateFrame,
} from '@/lib/ai/360/frameConsistencyValidator'
import { hasLockedScene, getLockedScene }    from '@/lib/product-360/lockedSceneVariables'
import type { P360GenerationConfig }          from '@/lib/ai/360/types'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 120   // one Imagen call: 10–60 s on average

type Ctx = { params: Promise<{ packageId: string }> }

const PUMPABLE = new Set([
  'queued', 'planning', 'generating', 'processing', 'paused_quota', 'failed',
])

function getLeonardoTextVariablesFormat(): 'json' | 'text' {
  return process.env.LEONARDO_360_TEXT_VARIABLES_FORMAT?.trim().toLowerCase() === 'json' ? 'json' : 'text'
}

function buildLeonardoTextVariablesPayload(input: {
  frameIndex: number
  angleDegrees: number
  lockedScenePrompt: string
  retryPrompt: string
  sceneBlueprint: Record<string, unknown>
  identityText?: string | null
}): string {
  const consistencyRules = [
    'Use the reference image as the visual identity anchor.',
    'Preserve the exact product identity.',
    'Preserve the exact plate, bowl, container, packaging, or vessel.',
    'Preserve the same table surface.',
    'Preserve the same wall and background.',
    'Preserve the same lighting, shadows, highlights, and atmosphere.',
    'Preserve the same camera distance, lens, crop, scale, and composition.',
    'Preserve the same props and object count.',
    'Preserve the same food toppings, ingredients, garnish, sauces, and surface details exactly.',
    'Only rotate the product or viewing angle to the requested angleDegrees.',
    'Do not add new objects.',
    'Do not remove objects.',
    'Do not zoom in or out.',
    'Do not change dish type, ingredients, colors, toppings, garnish, shape, scale, crop, surface, utensils, table, wall, or background.',
  ]
  const variables = {
    frameIndex: input.frameIndex,
    angleDegrees: input.angleDegrees,
    orbitInstruction: `Render the same product from a ${input.angleDegrees} degree clockwise orbit angle.`,
    lockedScenePrompt: input.lockedScenePrompt,
    framePrompt: input.retryPrompt,
    identityText: input.identityText ?? '',
    sceneBlueprint: input.sceneBlueprint,
    consistencyRules,
  }

  if (getLeonardoTextVariablesFormat() === 'json') return JSON.stringify(variables)

  return [
    input.lockedScenePrompt,
    '',
    input.identityText ?? '',
    '',
    `FRAME INDEX: ${input.frameIndex}`,
    `ANGLE DEGREES: ${input.angleDegrees}`,
    variables.orbitInstruction,
    '',
    'STRICT CONSISTENCY RULES:',
    ...consistencyRules.map(rule => `- ${rule}`),
    '',
    input.retryPrompt,
  ].filter(Boolean).join('\n')
}

// ─── Structured error helper ──────────────────────────────────────────────────

function pumpError(opts: {
  packageId:    string
  status:       number
  errorCode:    string
  errorMessage: string
  errorDetails?: string | null
  failedStage:  string
}) {
  console.error(
    `[P360] pump:error stage=${opts.failedStage} code=${opts.errorCode} msg="${opts.errorMessage}"`,
  )
    return NextResponse.json({
    ok:           false,
      status:       null,
      framesDone:   null,
      targetFrameCount: null,
      progressPercent: null,
      nextFrameIndex: null,
      previewImageUrl: null,
      error:        opts.errorMessage,
      details:      opts.errorDetails ?? null,
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
  const providerName = ((pkg.generation_provider as string) || 'gemini').toLowerCase()

  const provider = getProduct360Provider(providerName)
  if (!provider.isAvailable()) {
    const errs = provider.configErrors()
    const missingVars = errs.map(e => e.replace(/^Missing\s+/, '')).join(', ')
    const msg  = providerName === 'leonardo'
      ? `Missing Leonardo environment variables: ${missingVars}. Fix: add ${missingVars} to your server environment and restart the app.`
      : `360 provider "${providerName}" is not configured: ${errs.join('; ')}`
    await db.from('product_360_packages').update({
      status: 'failed', generation_error: msg, last_error_message: msg,
      last_provider_error: errs[0] ?? msg,
      last_error_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', packageId)
    return pumpError({ packageId, status: 503, errorCode: 'provider_not_configured',
      errorMessage: msg, failedStage: 'provider-init' })
  }

  // Reference image URL — Leonardo uses package.reference_image_url or package.master_frame_url only.
  // Product catalog images are not stable enough to act as the consistent blueprint anchor.
  const referenceImageUrl: string | null = (pkg.reference_image_url as string | null) ?? null

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

  // ── Reference image fallback chain ────────────────────────────────────────
  // Resolved here (after product load) so we can fall back to the product image.
  const resolvedReferenceImageUrl: string | null =
    referenceImageUrl ||
    (pkg.master_frame_url as string | null) ||
    null

  if (providerName === 'leonardo' && !resolvedReferenceImageUrl) {
    const msg = 'Leonardo generation requires a reference image or master frame. Upload a product reference image or generate a master frame first.'
    await db.from('product_360_packages').update({
      status: 'failed',
      generation_stage: 'failed',
      generation_error: msg,
      last_error_message: msg,
      last_error_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', packageId)
    return pumpError({ packageId, status: 422, errorCode: 'missing_reference_image', errorMessage: msg, failedStage: 'reference-check' })
  }

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

  console.info(`[P360] pump:blueprint-normalizing subject="${productName}"`)

  const consistencyMode = (pkg.consistency_mode as string) ?? 'strict'

  // ── Scene contract: build BEFORE frame 0 if missing ─────────────────────
  //
  // The scene contract (Product360LockedScene) is the strict per-field lock
  // that prevents product variant drift (e.g. cheese pizza → combo pizza).
  // It is built once per package using Gemini text, then stored in the blueprint.
  //
  // We run this for every package except 'standard' mode, whenever the
  // lockedScene field is absent or empty.
  //
  // The call takes ~3-5 seconds and only happens on the first pump call
  // (or on the first pump call after a schema upgrade).

  let blueprint = normalizeSceneBlueprint(pkg.scene_blueprint, subject, genConfig)

  if (consistencyMode !== 'standard' && !hasLockedScene(blueprint as unknown as Record<string, unknown>)) {
    console.info(`[P360] pump:scene-contract-build start packageId=${packageId}`)
    try {
      const orbitDir = genConfig.turnDirection === 'counter_clockwise' ? 'counterclockwise' : 'clockwise'
      const lockedScene = await buildSceneContract(subject, genConfig, null, totalFrames, orbitDir)
      if (lockedScene) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(blueprint as any).lockedScene = lockedScene
        console.info(`[P360] pump:scene-contract-built variant="${lockedScene.productVariant}"`)
      }
    } catch (scErr) {
      console.warn(`[P360] pump:scene-contract-build warn: ${scErr instanceof Error ? scErr.message : scErr}`)
    }
  }

  // Build (or reuse stored) locked generation prompt
  // Always rebuild from blueprint to pick up the new lockedScene if just built
  const hasStoredPrompt = typeof pkg.locked_generation_prompt === 'string' && (pkg.locked_generation_prompt as string).trim().length > 50
  const hasNewLockedScene = hasLockedScene(blueprint as unknown as Record<string, unknown>)

  // Rebuild prompt if: no stored prompt, OR new lockedScene was just added (which makes it much better)
  let lockedPrompt: string
  if (!hasStoredPrompt || (hasNewLockedScene && !(pkg.scene_blueprint as Record<string, unknown>)?.lockedScene)) {
    lockedPrompt = buildLockedGenerationPrompt(subject, genConfig, blueprint)
  } else {
    lockedPrompt = hasStoredPrompt ? (pkg.locked_generation_prompt as string) : buildLockedGenerationPrompt(subject, genConfig, blueprint)
  }

  // Persist blueprint + locked prompt (includes lockedScene if just built)
  if (!hasStoredPrompt || hasNewLockedScene) {
    await db.from('product_360_packages').update({
      scene_blueprint:          blueprint,
      locked_generation_prompt: lockedPrompt,
      updated_at:               new Date().toISOString(),
    }).eq('id', packageId)
  }

  // ── Transition package to 'generating' ───────────────────────────────────
  if (currentStatus !== 'generating') {
    const { error: statusErr } = await db
      .from('product_360_packages')
      .update({
        status:           'generating',
        generation_stage: 'generating',
        updated_at:       new Date().toISOString(),
      })
      .eq('id', packageId)

    if (statusErr) {
      console.error(`[P360] pump:error stage=status-transition error="${statusErr.message}"`)
      return pumpError({ packageId, status: 500, errorCode: 'db_error',
        errorMessage: `Failed to transition package to generating: ${statusErr.message}`,
        errorDetails: statusErr.details ?? null,
        failedStage:  'status-transition' })
    }
  }

  // ── Build / reuse identity blueprint (needed for Leonardo textVariables) ─
  let identityBp = getIdentityBlueprint(pkg.locked_identity_blueprint as Record<string, unknown> | null)

  if (!identityBp) {
    console.info(`[P360] pump:identity-blueprint-build start packageId=${packageId}`)
    try {
      identityBp = await buildIdentityBlueprint(productName, productDesc, genConfig)
      await db.from('product_360_packages').update({
        locked_identity_blueprint: identityBp as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      }).eq('id', packageId)
      console.info(`[P360] pump:identity-blueprint-built product="${identityBp.subject.productName}"`)
    } catch (bpErr) {
      console.warn(`[P360] pump:identity-blueprint-build warn: ${bpErr instanceof Error ? bpErr.message : bpErr}`)
    }
  }

  // ── Find next frame to process ────────────────────────────────────────────
  const { data: existingFrames, error: framesErr } = await db
    .from('product_360_frames')
    .select('frame_index, image_url, provider_job_id, provider_execution_id, provider_status, status, needs_regeneration')
    .eq('package_id', packageId)
    .order('frame_index', { ascending: true })

  if (framesErr) {
    console.warn(`[P360] pump:warn stage=frames-load error="${framesErr.message}" (non-fatal, assuming 0 frames)`)
  }

  const frames = (existingFrames ?? []) as Array<{
    frame_index:           number
    image_url:             string | null
    provider_job_id:       string | null
    provider_execution_id: string | null
    provider_status:       string | null
    status:                string | null
    needs_regeneration:    boolean | null
  }>
  const completedSet = new Set(frames.filter(f => !!f.image_url && !f.needs_regeneration).map(f => f.frame_index))
  // Track frames that have a pending async execution (not yet complete but started)
  // Prefer provider_execution_id over provider_job_id (provider_execution_id added in 047)
  const pollingFrameMap = new Map(
    frames
      .filter(f => !f.image_url && (f.provider_execution_id || f.provider_job_id))
      .map(f => [f.frame_index, (f.provider_execution_id ?? f.provider_job_id) as string]),
  )

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

  // ── Handle pending Leonardo execution for this frame (poll it) ───────────
  const pendingExecutionId = pollingFrameMap.get(nextFrameIndex) ?? null

  if (pendingExecutionId && providerName === 'leonardo' && provider.pollExecution) {
    console.info(
      `[P360] pump:leonardo-poll frame=${nextFrameIndex} executionId=${pendingExecutionId}`,
    )

    await db.from('product_360_packages').update({
      generation_stage: 'polling_provider',
      updated_at:       new Date().toISOString(),
    }).eq('id', packageId)

    const pollResult = await provider.pollExecution({ executionId: pendingExecutionId })

    if (pollResult.status === 'pending') {
      // Still in progress — update frame status and tell client to poll again
      const pendingMsg = pollResult.error?.message ?? `Frame ${nextFrameIndex} still generating via Leonardo. Pump again shortly.`
      console.info(`[P360] pump:leonardo-poll still pending frame=${nextFrameIndex}: ${pendingMsg}`)

      await db.from('product_360_frames').update({
        provider_status: 'processing',
        updated_at:      new Date().toISOString(),
      }).eq('package_id', packageId).eq('frame_index', nextFrameIndex)

      return NextResponse.json({
        ok: true, packageId, hasMore: true, done: false,
        packageStatus:    'generating',
        generationStage:  'polling_provider',
        progressPercent:  (pkg.progress_percent as number) ?? 0,
        framesDone:       completedSet.size,
        totalFrames,
        remainingFrames:  totalFrames - completedSet.size,
        processedFrameIndex: nextFrameIndex,
        message: pendingMsg,
      })
    }

    if (pollResult.status === 'failed') {
      const errMsg  = pollResult.error?.message ?? `Leonardo execution ${pendingExecutionId} failed`
      const errCode = pollResult.error?.code     ?? 'unknown'
      console.error(`[P360] pump:leonardo-poll-failed frame=${nextFrameIndex}: ${errMsg}`)

      await db.from('product_360_frames').update({
        status:                'failed',
        error_message:          errMsg,
        provider_status:        'failed',
        provider_error_message: errMsg,
        provider_error_details: pollResult.error?.details ?? null,
        provider_job_id:        null,         // clear so retry can start a new execution
        provider_execution_id:  null,
        updated_at:             new Date().toISOString(),
      }).eq('package_id', packageId).eq('frame_index', nextFrameIndex)

      await db.from('product_360_packages').update({
        status:                      'failed',
        generation_stage:            'failed',
        generation_error:            errMsg,
        last_provider_error:         errCode,
        last_provider_error_details: errMsg,
        last_error_message:          errMsg,
        last_error_at:               new Date().toISOString(),
        updated_at:                  new Date().toISOString(),
      }).eq('id', packageId)

      return pumpError({ packageId, status: 500, errorCode: 'provider_failed',
        errorMessage: errMsg, errorDetails: pollResult.error?.details ?? null,
        failedStage: 'polling_provider' })
    }

    // COMPLETED — upload the image to Supabase and proceed
    const isMasterFramePoll = nextFrameIndex === 0
    const angleDegPoll      = getFrameAngle(nextFrameIndex, totalFrames)
    const shotDirPoll       = getShotDirection(angleDegPoll)
    const promptUsedPoll    = isMasterFramePoll
      ? buildMasterFramePrompt(subject, genConfig, blueprint)
      : buildLockedFramePrompt(lockedPrompt, blueprint, angleDegPoll, nextFrameIndex, totalFrames, shotDirPoll, 0)

    await db.from('product_360_packages').update({
      generation_stage: 'uploading',
      updated_at:       new Date().toISOString(),
    }).eq('id', packageId)

    const mimePoll  = pollResult.mimeType ?? 'image/png'
    const extPoll   = mimePoll.includes('jpeg') ? 'jpg' : 'png'
    let   uploadedUrlPoll: string, storagePathPoll: string

    if (pollResult.imageBuffer) {
      const up = await uploadFrame({
        tenantId: tenantIdPkg, productId, packageId, frameIndex: nextFrameIndex,
        buffer: pollResult.imageBuffer, contentType: mimePoll, ext: extPoll,
      })
      uploadedUrlPoll = up.imageUrl; storagePathPoll = up.storagePath
    } else if (pollResult.imageUrl) {
      let fetchRes: Response
      try {
        fetchRes = await fetch(pollResult.imageUrl, { signal: AbortSignal.timeout(30_000) })
        if (!fetchRes.ok) throw new Error(`Remote frame fetch failed: HTTP ${fetchRes.status}`)
        const contentType = fetchRes.headers.get('content-type') ?? ''
        if (!contentType.toLowerCase().startsWith('image/')) {
          throw new Error(`Remote frame fetch did not return an image content-type. Got: ${contentType || 'unknown'}`)
        }
      } catch (fetchErr) {
        const fetchMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
        // Image URL exists but download failed — save it directly as image_url without re-uploading
        // (avoid losing the frame just because our CDN fetch timed out)
        console.warn(`[P360] pump:poll-image-fetch-failed — saving URL directly: ${fetchMsg}`)
        await db.from('product_360_frames').upsert({
          package_id: packageId, tenant_id: tenantIdPkg, product_id: productId,
          frame_index: nextFrameIndex, angle_degrees: angleDegPoll,
          image_url: pollResult.imageUrl, status: 'completed',
          storage_path: pollResult.imageUrl,
          storage_status: 'remote_url_fallback',
          prompt_used: promptUsedPoll.slice(0, 4000),
          is_master_frame: isMasterFramePoll,
          provider: 'leonardo', provider_status: 'completed', provider_job_id: null, provider_execution_id: null,
          alt_text: `${productName} – ${shotDirPoll} view`,
          generation_finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }, { onConflict: 'package_id,frame_index' })

        const newDoneF   = completedSet.size + 1
        const progressF  = Math.min(100, Math.round((newDoneF / totalFrames) * 100))
        const pkgUpdF: Record<string, unknown> = {
          frames_done: newDoneF, progress_percent: progressF,
          generation_stage: newDoneF < totalFrames ? 'generating' : 'processing',
          last_generated_at: new Date().toISOString(),
          last_generation_heartbeat: new Date().toISOString(), updated_at: new Date().toISOString(),
        }
        if (isMasterFramePoll) { pkgUpdF.master_frame_url = pollResult.imageUrl; pkgUpdF.master_frame_generated = true }
        await db.from('product_360_packages').update(pkgUpdF).eq('id', packageId)

        if (newDoneF >= totalFrames) {
          await db.from('product_360_packages').update({ status: 'processing', frame_count: totalFrames, updated_at: new Date().toISOString() }).eq('id', packageId)
          const fin = await finalizePackage(packageId)
          await db.from('product_360_packages').update({ generation_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', packageId)
          if (!fin.success) return pumpError({ packageId, status: 500, errorCode: 'finalize_failed', errorMessage: fin.errorMessage ?? 'Finalize failed', failedStage: 'finalize' })
          return NextResponse.json({ ok: true, packageId, hasMore: false, done: true, packageStatus: 'ready', progressPercent: 100, framesDone: totalFrames, totalFrames, previewUrl: fin.previewUrl ?? null, processedFrameIndex: nextFrameIndex, imageUrl: pollResult.imageUrl, message: `Generation complete. ${totalFrames} frames ready.` })
        }
        return NextResponse.json({ ok: true, packageId, hasMore: true, done: false, packageStatus: 'generating', generationStage: 'generating', progressPercent: progressF, framesDone: newDoneF, totalFrames, remainingFrames: totalFrames - newDoneF, processedFrameIndex: nextFrameIndex, imageUrl: pollResult.imageUrl, message: `Frame ${newDoneF} of ${totalFrames} generated (Leonardo, URL-only).` })
      }
      const fetchContentType = fetchRes.headers.get('content-type') ?? mimePoll
      const buf = Buffer.from(await fetchRes.arrayBuffer())
      const up  = await uploadFrame({
        tenantId: tenantIdPkg, productId, packageId, frameIndex: nextFrameIndex,
        buffer: buf, contentType: fetchContentType, ext: fetchContentType.includes('jpeg') ? 'jpg' : 'png',
      })
      uploadedUrlPoll = up.imageUrl; storagePathPoll = up.storagePath
    } else {
      // pollExecution returned status:'completed' but no imageBuffer/imageUrl
      // This means the poll timed out or the image URL was unextractable.
      const diagMsg = `Leonardo execution ${pendingExecutionId} did not return an image after polling. ` +
        `Check blueprint output configuration and ensure the blueprint produces image outputs.`
      console.error(`[P360] pump:leonardo-poll-no-image frame=${nextFrameIndex}: ${diagMsg}`)

      await db.from('product_360_frames').update({
        status:                 'failed',
        error_message:          diagMsg,
        provider_status:        'failed',
        provider_error_message: diagMsg,
        provider_job_id:        null,
        provider_execution_id:  null,
        updated_at:             new Date().toISOString(),
      }).eq('package_id', packageId).eq('frame_index', nextFrameIndex)

      await db.from('product_360_packages').update({
        status:                      'failed',
        generation_stage:            'failed',
        generation_error:            diagMsg,
        last_provider_error:         'no_image_returned',
        last_provider_error_details: diagMsg,
        last_error_message:          diagMsg,
        last_error_at:               new Date().toISOString(),
        updated_at:                  new Date().toISOString(),
      }).eq('id', packageId)

      return pumpError({ packageId, status: 502, errorCode: 'provider_no_image',
        errorMessage: diagMsg,
        errorDetails: `ExecutionId: ${pendingExecutionId}. No image URL was extractable from the Leonardo response. Check blueprint output configuration.`,
        failedStage: 'polling_provider' })
    }

    await db.from('product_360_frames').upsert({
      package_id:             packageId,
      tenant_id:              tenantIdPkg,
      product_id:             productId,
      frame_index:            nextFrameIndex,
      angle_degrees:          angleDegPoll,
      image_url:              uploadedUrlPoll,
      storage_path:           storagePathPoll,
      status:                 'completed',
      prompt_used:            promptUsedPoll.slice(0, 4000),
      is_master_frame:        isMasterFramePoll,
      provider:               'leonardo',
      provider_job_id:        null,         // clear now that it's done
      provider_execution_id:  null,
      provider_status:        'completed',
      alt_text:               `${productName} – ${shotDirPoll} view`,
      generation_finished_at: new Date().toISOString(),
      updated_at:             new Date().toISOString(),
    }, { onConflict: 'package_id,frame_index' })

    const newDonePoll      = completedSet.size + 1
    const progressPoll     = Math.min(100, Math.round((newDonePoll / totalFrames) * 100))
    const hasMorePoll      = newDonePoll < totalFrames
    const pkgUpdatePoll: Record<string, unknown> = {
      frames_done:               newDonePoll,
      progress_percent:          progressPoll,
      generation_stage:          hasMorePoll ? 'generating' : 'processing',
      last_generated_at:         new Date().toISOString(),
      last_generation_heartbeat: new Date().toISOString(),
      updated_at:                new Date().toISOString(),
    }
    if (isMasterFramePoll) {
      pkgUpdatePoll.master_frame_url       = uploadedUrlPoll
      pkgUpdatePoll.master_frame_generated = true
    }
    await db.from('product_360_packages').update(pkgUpdatePoll).eq('id', packageId)

    if (!hasMorePoll) {
      await db.from('product_360_packages').update({ status: 'processing', frame_count: totalFrames, updated_at: new Date().toISOString() }).eq('id', packageId)
      const fin = await finalizePackage(packageId)
      await db.from('product_360_packages').update({ generation_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', packageId)
      if (!fin.success) {
        return pumpError({ packageId, status: 500, errorCode: 'finalize_failed', errorMessage: fin.errorMessage ?? 'Finalize failed', failedStage: 'finalize' })
      }
      return NextResponse.json({ ok: true, packageId, hasMore: false, done: true, packageStatus: 'ready', progressPercent: 100, framesDone: totalFrames, totalFrames, previewUrl: fin.previewUrl ?? null, processedFrameIndex: nextFrameIndex, imageUrl: uploadedUrlPoll, message: `Generation complete. ${totalFrames} frames ready.` })
    }
    return NextResponse.json({ ok: true, packageId, hasMore: true, done: false, packageStatus: 'generating', generationStage: 'generating', progressPercent: progressPoll, framesDone: newDonePoll, totalFrames, remainingFrames: totalFrames - newDonePoll, processedFrameIndex: nextFrameIndex, imageUrl: uploadedUrlPoll, message: `Frame ${newDonePoll} of ${totalFrames} generated (Leonardo).` })
  }

  // ── Generate the selected frame ───────────────────────────────────────────
  const isMasterFrame = nextFrameIndex === 0
  const angleDeg      = getFrameAngle(nextFrameIndex, totalFrames)
  const shotDirection = getShotDirection(angleDeg)

  const framePrompt = isMasterFrame
    ? buildMasterFramePrompt(subject, genConfig, blueprint)
    : buildLockedFramePrompt(lockedPrompt, blueprint, angleDeg, nextFrameIndex, totalFrames, shotDirection, 0)

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
    generation_attempt:    1,
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

  // ── Auto-retry + drift-detection loop ────────────────────────────────────
  //
  // For strict/ultra_strict packages:
  //   1. Generate frame
  //   2. Validate against locked scene contract (vision API)
  //   3. If drift detected → regenerate with corrective prompt
  //   4. If still bad after MAX_FRAME_RETRIES → mark frame failed, continue
  //
  // Validation is only run for non-master frames in strict/ultra_strict mode.
  // Standard mode skips validation to save API quota.

  const MAX_FRAME_RETRIES = parseInt(process.env.P360_FRAME_MAX_RETRIES ?? '2', 10) || 2
  const lockedSceneForValidation = getLockedScene(blueprint as unknown as Record<string, unknown>)

  let lastFrameError: Error | null = null
  let result = null
  let actualAttempt = 0
  let lastDriftDetails: string | undefined

  for (let attempt = 0; attempt <= MAX_FRAME_RETRIES; attempt++) {
    actualAttempt = attempt
    if (attempt > 0) {
      console.info(`[P360] pump:retry attempt=${attempt + 1} frame=${nextFrameIndex} drift="${lastDriftDetails ?? ''}"`)
      await db.from('product_360_frames').update({
        generation_attempt: attempt + 1,
        updated_at:         new Date().toISOString(),
      }).eq('package_id', packageId).eq('frame_index', nextFrameIndex)
    }

    // Build progressively stricter / drift-corrective prompt on retries
    const retryPrompt = isMasterFrame
      ? buildMasterFramePrompt(subject, genConfig, blueprint)
      : buildLockedFramePrompt(lockedPrompt, blueprint, angleDeg, nextFrameIndex, totalFrames, shotDirection, attempt, lastDriftDetails)

    try {
      // Build text variables for Leonardo (includes locked identity + angle)
      const identityText = identityBp
        ? serializeIdentityBlueprintToTextVariables(
            identityBp,
            angleDeg,
            nextFrameIndex,
            totalFrames,
            'Use the provided reference image as the exact visual anchor. Match every visible detail precisely.',
          )
        : null
      const textVars = providerName === 'leonardo'
        ? buildLeonardoTextVariablesPayload({
            frameIndex: nextFrameIndex,
            angleDegrees: angleDeg,
            lockedScenePrompt: lockedPrompt,
            retryPrompt,
            sceneBlueprint: blueprint as unknown as Record<string, unknown>,
            identityText,
          })
        : (identityText ?? retryPrompt)

      console.info(`[P360] pump:provider:start provider="${providerName}" frame=${nextFrameIndex} attempt=${attempt + 1}`)

      result = await provider.generateFrame({
        prompt:                 retryPrompt,
        angleDegrees:           angleDeg,
        frameIndex:             nextFrameIndex,
        totalFrames,
        width:                  genConfig.outputWidth  ?? 1024,
        height:                 genConfig.outputHeight ?? 1024,
        referenceImageUrl:      resolvedReferenceImageUrl ?? undefined,
        referenceImageBase64:   masterBase64,
        referenceImageMimeType: masterMime,
        textVariables:          textVars,
      })

      // Leonardo returns status:'pending' for async executions
      if (result.status === 'pending' && result.pendingExecutionId) {
        const execId = result.pendingExecutionId
        console.info(
          `[P360] pump:leonardo-async frame=${nextFrameIndex} executionId=${execId} — saving and returning pending`,
        )

        await db.from('product_360_frames').upsert({
          package_id:            packageId,
          tenant_id:             tenantIdPkg,
          product_id:            productId,
          frame_index:           nextFrameIndex,
          angle_degrees:         angleDeg,
          status:                'generating',
          provider:              'leonardo',
          provider_job_id:       execId,
          provider_execution_id: execId,
          provider_status:       'processing',
          is_master_frame:       isMasterFrame,
          generation_attempt:    attempt + 1,
          generation_started_at: new Date().toISOString(),
          updated_at:            new Date().toISOString(),
        }, { onConflict: 'package_id,frame_index' })

        await db.from('product_360_packages').update({
          generation_stage:       'polling_provider',
          provider_job_id:        execId,
          leonardo_execution_id:  execId,
          last_generation_heartbeat: new Date().toISOString(),
          updated_at:             new Date().toISOString(),
        }).eq('id', packageId)

        const frameDoneSoFar = completedSet.size
        return NextResponse.json({
          ok: true, packageId, hasMore: true, done: false,
          packageStatus:    'generating',
          generationStage:  'polling_provider',
          progressPercent:  Math.round((frameDoneSoFar / totalFrames) * 100),
          framesDone:       frameDoneSoFar,
          totalFrames,
          remainingFrames:  totalFrames - frameDoneSoFar,
          processedFrameIndex: nextFrameIndex,
          message: `Frame ${nextFrameIndex} submitted to Leonardo. Execution: ${execId}. Will poll on next call.`,
        })
      }

      if (result.status === 'failed') {
        const provErr = result.error
        if (provErr?.isQuotaError) {
          throw Object.assign(new Error(provErr.message), { isQuota: true })
        }
        // Attach rawResponse so the catch block can persist diagnostics
        throw Object.assign(
          new Error(provErr?.message ?? 'Provider returned failed status'),
          { rawResponse: result.rawResponse ?? null },
        )
      }

      lastFrameError = null

      // ── Drift detection for non-master frames ──────────────────────────
      if (!isMasterFrame && lockedSceneForValidation && shouldValidateFrame(consistencyMode, isMasterFrame, attempt + 1)) {
        const frameBase64 = result.imageBuffer?.toString('base64')
        if (frameBase64) {
          const frameMime = (result.mimeType ?? 'image/png') as 'image/png' | 'image/jpeg'
          const validation = await validateFrameAgainstLockedScene(frameBase64, frameMime, lockedSceneForValidation)

          if (validation) {
            console.info(
              `[P360] pump:validation frame=${nextFrameIndex} score=${validation.score} ` +
              `passed=${validation.passed} drift=${validation.detectedVariantDrift}`,
            )

            // Save validation result to frame record
            await db.from('product_360_frames').update({
              consistency_score:    validation.score,
              consistency_details:  { score: validation.score, passed: validation.passed, issues: validation.issues, driftDetails: validation.driftDetails, attempt: attempt + 1 },
              updated_at:           new Date().toISOString(),
            }).eq('package_id', packageId).eq('frame_index', nextFrameIndex)

            if (validation.shouldRegenerate && attempt < MAX_FRAME_RETRIES) {
              lastDriftDetails = validation.driftDetails || validation.issues.join('; ')
              console.warn(
                `[P360] pump:drift-detected frame=${nextFrameIndex} attempt=${attempt + 1} ` +
                `details="${lastDriftDetails}" — regenerating`,
              )
              result = null   // signal that we need to retry
              continue        // go to next attempt
            }

            if (validation.detectedVariantDrift && !validation.passed && attempt >= MAX_FRAME_RETRIES) {
              // Final attempt still has drift — save error but allow frame to proceed
              // (better to have a slightly inconsistent frame than a failed package)
              await db.from('product_360_frames').update({
                error_message: `Consistency failed: ${validation.driftDetails || validation.issues.join('; ')}`,
                updated_at:    new Date().toISOString(),
              }).eq('package_id', packageId).eq('frame_index', nextFrameIndex)
              console.warn(`[P360] pump:validation-failed-final frame=${nextFrameIndex} — accepting frame with warning`)
            }
          }
        }
      }

      // Frame is accepted — break retry loop
      break

    } catch (e) {
      lastFrameError = e instanceof Error ? e : new Error(String(e))
      // Don't retry quota errors — they need to pause the whole package
      const isQuota = (lastFrameError as { isQuota?: boolean }).isQuota
        || lastFrameError.message.includes('429')
        || lastFrameError.message.toLowerCase().includes('quota')
      if (isQuota) throw lastFrameError
      console.warn(`[P360] pump:retry:attempt=${attempt + 1} failed: ${lastFrameError.message}`)
      if (attempt < MAX_FRAME_RETRIES) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
    }
  }

  // All retries exhausted
  // IMPORTANT: result may be set to a failed Generate360FrameResult object rather than null,
  // because `result = await provider.generateFrame(...)` runs before the throw in the try block.
  // We must check result.status here, not just !result.
  if (!result || result.status === 'failed') {
    const failedResult = result?.status === 'failed' ? result : null
    const errMsg = failedResult?.error?.message
      ?? lastFrameError?.message
      ?? 'Frame generation failed after all retry attempts'

    // Save the diagnostic to the frame and package before propagating
    if (failedResult) {
      const diag = failedResult.rawResponse ?? null
      await db.from('product_360_frames').update({
        status:                 'failed',
        error_message:          errMsg,
        provider:               providerName,
        provider_status:        'failed',
        provider_error_message: errMsg,
        provider_error_details: diag ? JSON.stringify(diag) : null,
        updated_at:             new Date().toISOString(),
      }).eq('package_id', packageId).eq('frame_index', nextFrameIndex)
    }

    throw lastFrameError ?? new Error(errMsg)
  }

  // ── After master frame: run vision analysis to enrich blueprint ───────────
  if (isMasterFrame && result.imageBuffer) {
    try {
      const masterBase64ForAnalysis = result.imageBuffer.toString('base64')
      const masterMimeForAnalysis   = result.mimeType ?? 'image/png'
      const analysis = await analyzeMasterFrame(masterBase64ForAnalysis, masterMimeForAnalysis)

      if (analysis) {
        const enrichedBlueprint = enrichBlueprintWithAnalysis(blueprint, analysis)

        // Also mark lockedScene as vision-enriched if present
        const existingLS = getLockedScene(enrichedBlueprint as unknown as Record<string, unknown>)
        if (existingLS) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(enrichedBlueprint as any).lockedScene = { ...existingLS, analysisSource: 'gemini_vision_enriched' }
        }

        const enrichedLockedPrompt = buildLockedGenerationPrompt(subject, genConfig, enrichedBlueprint)

        await db.from('product_360_packages').update({
          scene_blueprint:          enrichedBlueprint,
          locked_generation_prompt: enrichedLockedPrompt,
          master_frame_analysis:    analysis,
          analysis_version:         2,
          updated_at:               new Date().toISOString(),
        }).eq('id', packageId)

        // Update local blueprint for subsequent steps
        blueprint = enrichedBlueprint

        console.info(
          `[P360] pump:blueprint-enriched analysisVersion=2 ` +
          `vessel="${analysis.vesselExact.slice(0, 60)}"`,
        )
      } else {
        console.info('[P360] pump:blueprint analysis skipped (API unavailable or failed)')
      }
    } catch (analysisErr) {
      console.warn(`[P360] pump:blueprint-analysis-error: ${analysisErr instanceof Error ? analysisErr.message : analysisErr}`)
    }
  }

  console.info(`[P360] pump:provider:success frame=${nextFrameIndex} attempt=${actualAttempt + 1}`)

  try {
    const mimeType = result.mimeType ?? 'image/png'
    const ext      = mimeType.includes('jpeg') ? 'jpg' : 'png'
    let   uploadedUrl: string, storagePath: string
    let   storageStatus: string | null = null

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
      let fetchRes: Response
      try {
        fetchRes = await fetch(result.imageUrl, { signal: AbortSignal.timeout(30_000) })
        if (!fetchRes.ok) throw new Error(`Remote frame fetch failed: HTTP ${fetchRes.status} for ${result.imageUrl}`)
        const contentType = fetchRes.headers.get('content-type') ?? ''
        if (!contentType.toLowerCase().startsWith('image/')) {
          throw new Error(`Remote frame fetch did not return an image content-type. Got: ${contentType || 'unknown'}`)
        }
      } catch (fetchErr) {
        // Fetch failed but we have the URL — store it directly rather than failing the frame
        const fetchMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
        console.warn(`[P360] pump:image-fetch-warn — storing URL directly: ${fetchMsg}`)
        // Fall through to URL-only storage
        fetchRes = null as unknown as Response
      }
      if (fetchRes) {
        const fetchContentType = fetchRes.headers.get('content-type') ?? mimeType
        const buf = Buffer.from(await fetchRes.arrayBuffer())
        const up  = await uploadFrame({
          tenantId: tenantIdPkg, productId, packageId, frameIndex: nextFrameIndex,
          buffer: buf, contentType: fetchContentType, ext: fetchContentType.includes('jpeg') ? 'jpg' : 'png',
        })
        uploadedUrl = up.imageUrl; storagePath = up.storagePath
      } else {
        // Could not download — use the remote URL directly as the frame image
        uploadedUrl = result.imageUrl; storagePath = result.imageUrl; storageStatus = 'remote_url_fallback'
      }
    } else {
      // Provider returned a result with no imageBuffer and no imageUrl.
      // This can happen when Leonardo returns a pending/array response that
      // slipped past the pending check — build a precise message based on result.
      const rawDiag = result.rawResponse
        ?? (providerName === 'leonardo' ? buildLeonardoDiagnostic(null, 'generate-frame') : null)

      // Use accurate wording — do NOT say "completed" if the response was pending/unknown
      const noImageMsg = providerName === 'leonardo'
        ? `Leonardo accepted the request but did not return an image URL or image buffer. ` +
          `This usually means the response is still pending or the blueprint output is misconfigured. ` +
          (rawDiag ? `Debug: shape=${rawDiag['responseShape'] ?? '?'}, keys=[${(rawDiag['topLevelKeys'] as string[] | undefined)?.join(', ') ?? '?'}]. ` : '') +
          `Pump again to retry or check blueprint configuration.`
        : `Provider "${providerName}" did not return an image buffer or image URL. ` +
          `Check provider configuration and retry.`

      console.error(`[P360] pump:no-image provider=${providerName} frame=${nextFrameIndex}: ${noImageMsg}`)

      await db.from('product_360_frames').update({
        status:                 'failed',
        error_message:          noImageMsg,
        provider:               providerName,
        provider_status:        'failed',
        provider_error_message: noImageMsg,
        provider_error_details: rawDiag ? JSON.stringify(rawDiag) : null,
        updated_at:             new Date().toISOString(),
      }).eq('package_id', packageId).eq('frame_index', nextFrameIndex)

      await db.from('product_360_packages').update({
        status:                      'failed',
        generation_stage:            'failed',
        generation_error:            noImageMsg,
        last_provider_error:         'no_image_returned',
        last_provider_error_details: noImageMsg,
        last_error_message:          noImageMsg,
        last_error_at:               new Date().toISOString(),
        updated_at:                  new Date().toISOString(),
      }).eq('id', packageId)

      return pumpError({
        packageId,
        status:       502,
        errorCode:    'provider_no_image',
        errorMessage: noImageMsg,
        errorDetails: rawDiag ? JSON.stringify(rawDiag) : null,
        failedStage:  'provider',
      })
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
      storage_status:          storageStatus,
      status:                  'completed',
      prompt_used:             (isMasterFrame
        ? buildMasterFramePrompt(subject, genConfig, blueprint)
        : buildLockedFramePrompt(lockedPrompt, blueprint, angleDeg, nextFrameIndex, totalFrames, shotDirection, actualAttempt, lastDriftDetails)
      ).slice(0, 4000),
      is_master_frame:         isMasterFrame,
      generation_attempt:      actualAttempt + 1,
      provider:                providerName,
      provider_status:         'completed',
      provider_job_id:         null,    // clear any pending execution marker
      provider_execution_id:   null,
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
        status:                      'paused_quota',
        generation_stage:            'paused_quota',
        generation_error:            normalized.message,
        last_error_type:             'quota_exceeded',
        last_error_message:          normalized.message,
        last_provider_error:         'quota_exceeded',
        last_provider_error_details: normalized.message,
        last_error_at:               new Date().toISOString(),
        next_retry_at:               retryAt,
        retry_count:                 retryCountPkg + 1,
        updated_at:                  new Date().toISOString(),
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
    let friendlyMessage = 'AI image generation failed. Try again or contact an administrator.'
    if (errMsg.includes('text output') || errMsg.includes('text only')) {
      friendlyMessage = 'The configured AI service does not support image generation. Contact an administrator.'
    } else if (errMsg.includes('GEMINI_API_KEY') || errMsg.includes('Missing')) {
      friendlyMessage = 'AI image generation is not configured. Contact an administrator.'
    } else if (errMsg.includes('bucket') || errMsg.includes('Storage')) {
      friendlyMessage = `Storage upload failed. ${errMsg}`
    } else if (errMsg.includes('403') || errMsg.includes('access denied') || errMsg.includes('PERMISSION_DENIED')) {
      friendlyMessage = 'AI image generation access was denied. Contact an administrator.'
    }

    // Extract diagnostic from the error if it's a provider failure with rawResponse
    const rawDiag = (err as { rawResponse?: Record<string, unknown> }).rawResponse ?? null

    await db.from('product_360_frames').update({
      status:                 'failed',
      error_message:          errMsg,
      provider:               providerName,
      provider_status:        'failed',
      provider_error_message: errMsg,
      provider_error_details: rawDiag ? JSON.stringify(rawDiag) : null,
      updated_at:             new Date().toISOString(),
    }).eq('package_id', packageId).eq('frame_index', nextFrameIndex)

    await db.from('product_360_packages').update({
      status:                      'failed',
      generation_stage:            'failed',
      generation_error:            friendlyMessage,
      last_error_message:          friendlyMessage,
      last_error_details:          errStack || null,
      last_provider_error:         friendlyMessage.slice(0, 200),
      last_provider_error_details: errStack || null,
      last_provider_debug:         rawDiag ?? null,
      last_error_at:               new Date().toISOString(),
      updated_at:                  new Date().toISOString(),
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
