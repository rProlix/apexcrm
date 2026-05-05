// lib/product-360/generationService.ts
// Orchestrates AI frame generation for a 360° package.
//
// ═══════════════════════════════════════════════════════════════════════
// KEY BEHAVIOURS
// ═══════════════════════════════════════════════════════════════════════
//
// RESUMABLE
//   Before generating any frame, load the set of already-completed frame
//   indices from product_360_frames.  Skip frames that already have a
//   valid image_url — this makes the pipeline safe to restart after a
//   quota pause or crash.
//
// QUOTA-AWARE
//   When Imagen returns HTTP 429 (or any ImagenApiError with status 429):
//   • Stop generation immediately — do NOT retry in a loop.
//   • Mark the package status = 'paused_quota'.
//   • Store last_error_type, last_error_at, next_retry_at.
//   • Return { success: false, pausedForQuota: true } so the route handler
//     can send a structured 429 response to the client.
//
// THROTTLED
//   Respects env vars:
//   • IMAGE_GENERATION_DELAY_MS   default 1500 ms between frames
//   • MAX_360_FRAMES_PER_PACKAGE  hard cap, default 24
//   • DEFAULT_360_FRAMES_PER_PACKAGE  used when package has no preference, default 12
//
// 3-STAGE LOCKED PROMPTS
//   Stage A: master frame (0°, buildMasterFramePrompt)
//   Stage B: scene blueprint + locked_generation_prompt saved to DB
//   Stage C: locked frame prompts (buildLockedFramePrompt) for frames 1-N
//
// SERVER-ONLY. Never import from client components.

import { getSupabaseServerClient }  from '@/lib/supabase/server'
import { requireP360Provider }      from '@/lib/ai/360/provider'
import { ImagenApiError }           from '@/lib/ai/360/imagenProvider'
import { uploadFrame }              from './storage'
import { finalizePackage }          from './finalize'
import { normalizeProductSubject }  from '@/lib/ai/360/normalizeProduct'
import {
  buildSceneBlueprint,
  buildLockedGenerationPrompt,
  buildMasterFramePrompt,
  buildLockedFramePrompt,
  getFrameAngle,
  getShotDirection,
  type SceneBlueprint,
} from '@/lib/ai/360/buildLockedFramePrompt'
import { normalizeAiError } from '@/lib/ai/normalizeAiError'
import type { P360GenerationConfig, P360ProductDescriptor } from '@/lib/ai/360/types'

// ─── Env-var throttle/quota limits ───────────────────────────────────────────

function getDelayMs():        number { return parseInt(process.env.IMAGE_GENERATION_DELAY_MS         ?? '1500', 10) || 1500 }
function getMaxFrames():      number { return parseInt(process.env.MAX_360_FRAMES_PER_PACKAGE        ?? '24',   10) || 24   }
function getDefaultFrames():  number { return parseInt(process.env.DEFAULT_360_FRAMES_PER_PACKAGE    ?? '12',   10) || 12   }

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface GeneratePackageResult {
  success:          boolean
  framesGenerated:  number
  previewUrl?:      string | null
  errorMessage?:    string
  /** True when generation stopped due to a 429 quota limit. */
  pausedForQuota?:  boolean
  /** ISO timestamp: earliest the package can be retried (from Retry-After). */
  retryAt?:         string | null
  /** True when generation was stopped by a user-initiated cancel request. */
  cancelled?:       boolean
}

export interface RegenerateFrameResult {
  success:       boolean
  imageUrl?:     string
  errorMessage?: string
}

// ─── Main generation pipeline ─────────────────────────────────────────────────

/**
 * Generate all frames for a 360° package using the 3-stage locked pipeline.
 *
 * Status lifecycle:
 *   queued → generating → [master frame] → [locked frames] → processing → ready
 *   On 429: → paused_quota (resumable)
 *   On other error: → failed
 *
 * Resumable: re-calling this function skips frames that already have image_url.
 */
export async function generatePackage(packageId: string): Promise<GeneratePackageResult> {
  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // ── Load package ────────────────────────────────────────────────────────────
  const { data: pkg, error: pkgErr } = await db
    .from('product_360_packages')
    .select([
      'id', 'tenant_id', 'product_id', 'name', 'description',
      'generation_prompt', 'generation_notes', 'negative_prompt',
      'target_frame_count', 'generation_provider', 'ai_model',
      'lighting_preset', 'background_preset', 'category_preset', 'camera_preset',
      'camera_distance', 'camera_height', 'fov', 'zoom',
      'shadow_strength', 'reflection_intensity', 'turn_direction',
      'output_width', 'output_height',
      'consistency_mode', 'retry_count',
      'scene_blueprint', 'locked_generation_prompt', 'master_frame_url',
    ].join(', '))
    .eq('id', packageId)
    .maybeSingle()

  if (pkgErr || !pkg) {
    return { success: false, framesGenerated: 0, errorMessage: 'Package not found' }
  }

  const tenantId  = pkg.tenant_id  as string
  const productId = pkg.product_id as string | null

  if (!productId) {
    await markFailed(packageId, 'Package has no product attached.')
    return { success: false, framesGenerated: 0, errorMessage: 'No product attached' }
  }

  // ── Load product info ────────────────────────────────────────────────────────
  const { data: product } = await db
    .from('products')
    .select('name, description, category, attributes')
    .eq('id', productId)
    .maybeSingle()

  const productDescriptor: P360ProductDescriptor = {
    name:        (pkg.name as string) || (product?.name as string) || 'Product',
    description: (product?.description as string) || (pkg.description as string) || '',
    category:    (product?.category as string) || (pkg.category_preset as string) || undefined,
    attributes:  (product?.attributes as Record<string, string | number | boolean>) || undefined,
  }

  // ── Check provider ───────────────────────────────────────────────────────────
  let provider
  try {
    provider = requireP360Provider()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI provider not configured'
    await markFailed(packageId, msg)
    return { success: false, framesGenerated: 0, errorMessage: msg }
  }

  // ── Determine frame count (env cap applied) ──────────────────────────────────
  const requestedCount  = (pkg.target_frame_count as number) || getDefaultFrames()
  const totalFrames     = Math.min(requestedCount, getMaxFrames())
  const plannerModel    = (process.env.GEMINI_360_PLANNER_MODEL ?? 'gemini-2.5-flash-lite').trim()
  const delayMs         = getDelayMs()
  const retryCount      = ((pkg.retry_count as number) ?? 0)

  // ── Build generation config ──────────────────────────────────────────────────
  const genConfig: P360GenerationConfig = {
    frameCount:          totalFrames,
    lightingPreset:      (pkg.lighting_preset    as string | null),
    backgroundPreset:    (pkg.background_preset  as string | null),
    categoryPreset:      (pkg.category_preset    as string | null),
    cameraPreset:        (pkg.camera_preset      as string | null),
    cameraDistance:      (pkg.camera_distance    as number | null),
    cameraHeight:        (pkg.camera_height      as number | null),
    fov:                 (pkg.fov                as number | null),
    shadowStrength:      (pkg.shadow_strength    as number | null),
    reflectionIntensity: (pkg.reflection_intensity as number | null),
    turnDirection:       ((pkg.turn_direction as string) === 'counter_clockwise'
                          ? 'counter_clockwise'
                          : 'clockwise'),
    outputWidth:         (pkg.output_width  as number | null),
    outputHeight:        (pkg.output_height as number | null),
    generationNotes:     (pkg.generation_notes as string | null),
    customPrompt:        (pkg.generation_prompt as string | null) || null,
  }

  // ── Build or reuse locked scene spec (Stage B) ───────────────────────────────
  const subject = normalizeProductSubject(
    productDescriptor.name,
    productDescriptor.description,
    genConfig.categoryPreset,
  )

  const blueprint: SceneBlueprint =
    (pkg.scene_blueprint as SceneBlueprint | null) ?? buildSceneBlueprint(subject, genConfig)

  const lockedPrompt: string =
    (pkg.locked_generation_prompt as string | null) ?? buildLockedGenerationPrompt(subject, genConfig, blueprint)

  console.info(
    `[p360:generate] pkg=${packageId} frames=${totalFrames} delayMs=${delayMs} ` +
    `product="${subject.name}" vessel=${subject.vessel} retry=${retryCount}`,
  )

  // ── Load already-completed frames (for resume idempotency) ──────────────────
  const { data: existingFrameRows } = await db
    .from('product_360_frames')
    .select('frame_index, image_url')
    .eq('package_id', packageId)
    .not('image_url', 'is', null)

  const completedIndices = new Set<number>(
    ((existingFrameRows ?? []) as Array<{ frame_index: number; image_url: string | null }>)
      .filter(f => !!f.image_url)
      .map(f => f.frame_index),
  )
  const alreadyDone = completedIndices.size

  console.info(`[p360:generate] pkg=${packageId} resuming: ${alreadyDone} frames already completed`)

  // ── Mark generating (preserve frames_done from already-completed frames) ────
  await db
    .from('product_360_packages')
    .update({
      status:                    'generating',
      generation_error:          null,
      last_error_type:           null,
      last_error_at:             null,
      generation_provider:       provider.name,
      ai_model:                  provider.model,
      planner_model:             plannerModel,
      frames_done:               alreadyDone,
      progress_percent:          alreadyDone > 0 ? Math.round((alreadyDone / totalFrames) * 100) : 0,
      scene_blueprint:           blueprint,
      locked_generation_prompt:  lockedPrompt,
      generation_started_at:     new Date().toISOString(),
      updated_at:                new Date().toISOString(),
    })
    .eq('id', packageId)

  // ── Create generation job record ─────────────────────────────────────────────
  const { data: jobRow } = await db
    .from('product_360_generation_jobs')
    .insert({
      tenant_id:          tenantId,
      package_id:         packageId,
      product_id:         productId,
      provider:           provider.name,
      ai_model:           provider.model,
      status:             'running',
      prompt:             lockedPrompt.slice(0, 4000),
      target_frame_count: totalFrames,
      started_at:         new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()

  const jobId = (jobRow as { id: string } | null)?.id

  let framesGenerated = alreadyDone
  let masterFrameBase64: string | undefined
  let masterFrameMime   = 'image/png'

  // If master frame already exists, load its base64 for reference
  const storedMasterUrl = pkg.master_frame_url as string | null
  if (storedMasterUrl && completedIndices.has(0)) {
    try {
      const res = await fetch(storedMasterUrl)
      if (res.ok) {
        masterFrameBase64 = Buffer.from(await res.arrayBuffer()).toString('base64')
        masterFrameMime   = res.headers.get('content-type') ?? 'image/png'
      }
    } catch { /* non-fatal — proceed without reference */ }
  }

  try {
    // ══════════════════════════════════════════════════════════════════
    // CANCEL CHECK — Before we start any expensive work, verify the user
    //               hasn't already requested a stop.
    // ══════════════════════════════════════════════════════════════════
    if (await checkCancellation(packageId, db)) {
      console.info(`[p360:generate] pkg=${packageId} — cancel detected before generation start`)
      await db.from('product_360_packages').update({
        frames_done:      framesGenerated,
        progress_percent: framesGenerated > 0 ? Math.round((framesGenerated / totalFrames) * 100) : 0,
        updated_at:       new Date().toISOString(),
      }).eq('id', packageId)
      return { success: false, framesGenerated, cancelled: true }
    }

    // ══════════════════════════════════════════════════════════════════
    // STAGE A — Generate the master frame (frame 0, angle 0°)
    //           Skip if already completed.
    // ══════════════════════════════════════════════════════════════════

    if (!completedIndices.has(0)) {
      console.info(`[p360:generate] pkg=${packageId} STAGE A: generating master frame (0°)…`)

      const masterPrompt = buildMasterFramePrompt(subject, genConfig, blueprint)
      const masterResult = await provider.generateFrame({
        prompt:  masterPrompt,
        width:   genConfig.outputWidth  ?? 1024,
        height:  genConfig.outputHeight ?? 1024,
      })

      const masterMime = masterResult.mimeType ?? 'image/png'
      const masterExt  = masterMime.includes('jpeg') ? 'jpg' : 'png'
      let   masterBuffer: Buffer
      let   masterUrl:    string
      let   masterPath:   string

      if (masterResult.imageBuffer) {
        masterBuffer = masterResult.imageBuffer
        const up = await uploadFrame({ tenantId, productId, packageId, frameIndex: 0, buffer: masterBuffer, contentType: masterMime, ext: masterExt })
        masterUrl = up.imageUrl; masterPath = up.storagePath
      } else if (masterResult.imageUrl) {
        const fetchRes = await fetch(masterResult.imageUrl)
        if (!fetchRes.ok) throw new Error(`Master frame fetch failed (HTTP ${fetchRes.status})`)
        masterBuffer = Buffer.from(await fetchRes.arrayBuffer())
        const up = await uploadFrame({ tenantId, productId, packageId, frameIndex: 0, buffer: masterBuffer, contentType: fetchRes.headers.get('content-type') ?? masterMime, ext: masterExt })
        masterUrl = up.imageUrl; masterPath = up.storagePath
      } else {
        throw new Error('Master frame: provider returned neither buffer nor URL')
      }

      masterFrameBase64 = masterBuffer.toString('base64')
      masterFrameMime   = masterMime

      await db.from('product_360_frames').upsert({
        package_id: packageId, tenant_id: tenantId, product_id: productId,
        frame_index: 0, angle_degrees: 0,
        image_url: masterUrl, storage_path: masterPath,
        prompt_used: buildMasterFramePrompt(subject, genConfig, blueprint).slice(0, 4000),
        is_master_frame: true, generation_attempt: 1,
        alt_text: `${subject.name} – front view (master)`,
        metadata: { angleDeg: 0, shotDirection: 'front', isMaster: true },
      }, { onConflict: 'package_id,frame_index' })

      await db.from('product_360_packages').update({
        master_frame_url: masterUrl, master_frame_generated: true,
        frames_done: 1, progress_percent: Math.round((1 / totalFrames) * 100),
        updated_at: new Date().toISOString(),
      }).eq('id', packageId)

      framesGenerated = 1
      completedIndices.add(0)
      console.info(`[p360:generate] pkg=${packageId} STAGE A complete: ${masterUrl}`)

      // Throttle before next frame
      if (totalFrames > 1) await sleep(delayMs)
    }

    // ══════════════════════════════════════════════════════════════════
    // STAGE C — Generate remaining frames (resumable, throttled)
    // ══════════════════════════════════════════════════════════════════

    for (let frameIndex = 1; frameIndex < totalFrames; frameIndex++) {
      // Skip already-completed frames
      if (completedIndices.has(frameIndex)) {
        console.info(`[p360:generate] pkg=${packageId} frame ${frameIndex} already complete — skipping`)
        continue
      }

      // ── CANCEL CHECK — poll DB before every expensive API call ───────────
      if (await checkCancellation(packageId, db)) {
        console.info(
          `[p360:generate] pkg=${packageId} — cancel detected before frame ${frameIndex}` +
          ` (${framesGenerated}/${totalFrames} frames saved)`,
        )
        await db.from('product_360_packages').update({
          frames_done:      framesGenerated,
          progress_percent: Math.round((framesGenerated / totalFrames) * 100),
          updated_at:       new Date().toISOString(),
        }).eq('id', packageId)
        return { success: false, framesGenerated, cancelled: true }
      }

      const angleDeg      = getFrameAngle(frameIndex, totalFrames)
      const shotDirection = getShotDirection(angleDeg)

      const framePrompt = buildLockedFramePrompt(
        lockedPrompt, angleDeg, frameIndex, totalFrames, shotDirection,
      )

      // Throttle: wait before each frame (except the very first after master)
      if (frameIndex > 1) await sleep(delayMs)

      const frameResult = await provider.generateFrame({
        prompt:                 framePrompt,
        width:                  genConfig.outputWidth  ?? 1024,
        height:                 genConfig.outputHeight ?? 1024,
        referenceImageBase64:   masterFrameBase64,
        referenceImageMimeType: masterFrameMime,
      })

      const mimeType = frameResult.mimeType ?? 'image/png'
      const ext      = mimeType.includes('jpeg') ? 'jpg' : 'png'
      let uploadedUrl: string
      let storagePath: string

      if (frameResult.imageBuffer) {
        const up = await uploadFrame({ tenantId, productId, packageId, frameIndex, buffer: frameResult.imageBuffer, contentType: mimeType, ext })
        uploadedUrl = up.imageUrl; storagePath = up.storagePath
      } else if (frameResult.imageUrl) {
        const fetchRes = await fetch(frameResult.imageUrl)
        if (!fetchRes.ok) throw new Error(`Frame ${frameIndex} fetch failed (HTTP ${fetchRes.status})`)
        const buf = Buffer.from(await fetchRes.arrayBuffer())
        const up  = await uploadFrame({ tenantId, productId, packageId, frameIndex, buffer: buf, contentType: fetchRes.headers.get('content-type') ?? mimeType, ext })
        uploadedUrl = up.imageUrl; storagePath = up.storagePath
      } else {
        throw new Error(`Frame ${frameIndex}: provider returned neither buffer nor URL`)
      }

      await db.from('product_360_frames').upsert({
        package_id: packageId, tenant_id: tenantId, product_id: productId,
        frame_index: frameIndex, angle_degrees: angleDeg,
        image_url: uploadedUrl, storage_path: storagePath,
        prompt_used: framePrompt.slice(0, 4000),
        is_master_frame: false, generation_attempt: 1,
        alt_text: `${subject.name} – ${shotDirection} view`,
        metadata: { angleDeg, shotDirection },
      }, { onConflict: 'package_id,frame_index' })

      framesGenerated++
      completedIndices.add(frameIndex)

      console.info(
        `[p360:generate] pkg=${packageId} frame ${framesGenerated}/${totalFrames} done (${angleDeg}°)`,
      )

      // Update progress every 3 frames or on the last frame
      if (framesGenerated % 3 === 0 || framesGenerated === totalFrames) {
        const progressPct = Math.min(100, Math.round((framesGenerated / totalFrames) * 100))
        await db.from('product_360_packages').update({
          frames_done: framesGenerated, progress_percent: progressPct,
          updated_at: new Date().toISOString(),
        }).eq('id', packageId)
      }

      if (jobId) {
        await db.from('product_360_generation_jobs')
          .update({ frames_completed: framesGenerated }).eq('id', jobId)
      }
    }

    // ── Cancel check before finalize ─────────────────────────────────────────
    if (await checkCancellation(packageId, db)) {
      console.info(
        `[p360:generate] pkg=${packageId} — cancel detected after all frames, before finalize` +
        ` (${framesGenerated} frames saved)`,
      )
      await db.from('product_360_packages').update({
        frames_done: framesGenerated,
        progress_percent: 100,
        updated_at: new Date().toISOString(),
      }).eq('id', packageId)
      return { success: false, framesGenerated, cancelled: true }
    }

    // ── All frames done — finalize ────────────────────────────────────────────
    await db.from('product_360_packages').update({
      status: 'processing', frames_done: framesGenerated,
      progress_percent: 100, frame_count: framesGenerated,
      updated_at: new Date().toISOString(),
    }).eq('id', packageId)

    console.info(`[p360:generate] pkg=${packageId} → processing, calling finalize…`)

    const fin = await finalizePackage(packageId)

    if (jobId) {
      await db.from('product_360_generation_jobs').update({
        status: fin.success ? 'completed' : 'failed',
        frames_completed: framesGenerated,
        error_message: fin.errorMessage ?? null,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId)
    }

    if (!fin.success) {
      return { success: false, framesGenerated, previewUrl: null, errorMessage: fin.errorMessage }
    }

    // Mark generation_completed_at
    await db.from('product_360_packages').update({
      generation_completed_at: new Date().toISOString(),
    }).eq('id', packageId)

    console.info(`[p360:generate] pkg=${packageId} → ready (${framesGenerated} frames)`)
    return { success: true, framesGenerated, previewUrl: fin.previewUrl }

  } catch (err) {
    // ── Special case: 429 quota exceeded ─────────────────────────────────────
    if (err instanceof ImagenApiError && err.statusCode === 429) {
      const normalized = normalizeAiError(429, err.message)
      const retryAt    = normalized.retryAfter
        ? new Date(Date.now() + normalized.retryAfter * 1000).toISOString()
        : null

      console.warn(
        `[p360:generate] pkg=${packageId} — 429 quota exceeded after ` +
        `${framesGenerated}/${totalFrames} frames. Pausing.`,
      )

      await db.from('product_360_packages').update({
        status:          'paused_quota',
        generation_error: normalized.message,
        last_error_type:  'quota_exceeded',
        last_error_at:    new Date().toISOString(),
        next_retry_at:    retryAt,
        retry_count:      retryCount + 1,
        frames_done:      framesGenerated,
        progress_percent: Math.round((framesGenerated / totalFrames) * 100),
        updated_at:       new Date().toISOString(),
      }).eq('id', packageId)

      if (jobId) {
        await db.from('product_360_generation_jobs').update({
          status: 'failed', error_message: normalized.message,
          completed_at: new Date().toISOString(),
        }).eq('id', jobId)
      }

      return {
        success:         false,
        framesGenerated,
        pausedForQuota:  true,
        retryAt,
        errorMessage:    normalized.message,
      }
    }

    // ── General failure ───────────────────────────────────────────────────────
    let errorMessage = err instanceof Error ? err.message : 'Unknown generation error'

    if (errorMessage.includes('text output') || errorMessage.includes('text only')) {
      errorMessage = 'The selected AI model only supports text output. Image generation requires an Imagen model (imagen-4.0-ultra-generate-001).'
    } else if (errorMessage.includes('GEMINI_API_KEY') || errorMessage.includes('GOOGLE_API_KEY') || errorMessage.includes('Missing')) {
      errorMessage = 'Missing Gemini/Google API key. Add GEMINI_API_KEY to your Vercel environment variables.'
    } else if (errorMessage.includes('upload') || errorMessage.includes('Storage')) {
      errorMessage = 'Image generated but failed to upload to Supabase Storage. ' + errorMessage
    } else if (errorMessage.includes('403') || errorMessage.includes('access denied')) {
      errorMessage = 'Imagen API access denied. Ensure GEMINI_API_KEY has the Imagen API enabled in Google Cloud Console.'
    }

    console.error(`[p360:generate] pkg=${packageId} failed after ${framesGenerated} frames:`, err)
    await markFailed(packageId, errorMessage)

    if (jobId) {
      await db.from('product_360_generation_jobs').update({
        status: 'failed', error_message: errorMessage,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId)
    }

    return { success: false, framesGenerated, previewUrl: null, errorMessage }
  }
}

// ─── Single-frame regeneration ────────────────────────────────────────────────

/**
 * Regenerate a single frame using the package's locked scene prompt.
 * Uses the stored locked_generation_prompt so the scene spec is consistent.
 */
export async function regenerateSingleFrame(
  packageId: string,
  frameId:   string,
): Promise<RegenerateFrameResult> {
  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [{ data: pkg }, { data: frame }] = await Promise.all([
    db.from('product_360_packages')
      .select([
        'id', 'tenant_id', 'product_id', 'name', 'description',
        'generation_prompt', 'generation_notes', 'negative_prompt',
        'ai_model', 'lighting_preset', 'background_preset', 'category_preset',
        'camera_preset', 'camera_distance', 'camera_height', 'fov',
        'shadow_strength', 'reflection_intensity', 'turn_direction',
        'output_width', 'output_height', 'target_frame_count',
        'locked_generation_prompt', 'scene_blueprint', 'master_frame_url',
      ].join(', '))
      .eq('id', packageId).maybeSingle(),
    db.from('product_360_frames')
      .select('id, frame_index, angle_degrees, generation_attempt, is_master_frame')
      .eq('id', frameId).eq('package_id', packageId).maybeSingle(),
  ])

  if (!pkg || !frame) return { success: false, errorMessage: 'Package or frame not found' }

  const tenantId  = pkg.tenant_id  as string
  const productId = pkg.product_id as string

  const { data: product } = await db
    .from('products').select('name, description, category, attributes')
    .eq('id', productId).maybeSingle()

  const productDescriptor: P360ProductDescriptor = {
    name:        (pkg.name as string) || (product?.name as string) || 'Product',
    description: (product?.description as string) || '',
    category:    (product?.category as string) || undefined,
    attributes:  (product?.attributes as Record<string, string | number | boolean>) || undefined,
  }

  const totalFrames = (pkg.target_frame_count as number) || getDefaultFrames()
  const genConfig: P360GenerationConfig = {
    frameCount:          Math.min(totalFrames, getMaxFrames()),
    lightingPreset:      pkg.lighting_preset    as string | null,
    backgroundPreset:    pkg.background_preset  as string | null,
    categoryPreset:      pkg.category_preset    as string | null,
    cameraPreset:        pkg.camera_preset      as string | null,
    cameraDistance:      pkg.camera_distance    as number | null,
    cameraHeight:        pkg.camera_height      as number | null,
    fov:                 pkg.fov                as number | null,
    shadowStrength:      pkg.shadow_strength    as number | null,
    reflectionIntensity: pkg.reflection_intensity as number | null,
    turnDirection:       (pkg.turn_direction as string) === 'counter_clockwise' ? 'counter_clockwise' : 'clockwise',
    outputWidth:         pkg.output_width  as number | null,
    outputHeight:        pkg.output_height as number | null,
    generationNotes:     pkg.generation_notes as string | null,
    customPrompt:        (pkg.generation_prompt as string | null) || null,
  }

  const frameIndex    = frame.frame_index    as number
  const isMasterFrame = (frame.is_master_frame as boolean) || frameIndex === 0

  const subject     = normalizeProductSubject(productDescriptor.name, productDescriptor.description, genConfig.categoryPreset)
  const bp          = (pkg.scene_blueprint as SceneBlueprint | null) ?? buildSceneBlueprint(subject, genConfig)
  const storedLocked = (pkg.locked_generation_prompt as string | null) ?? buildLockedGenerationPrompt(subject, genConfig, bp)

  const framePrompt = isMasterFrame
    ? buildMasterFramePrompt(subject, genConfig, bp)
    : buildLockedFramePrompt(storedLocked, getFrameAngle(frameIndex, genConfig.frameCount), frameIndex, genConfig.frameCount, getShotDirection(getFrameAngle(frameIndex, genConfig.frameCount)))

  // Fetch master frame as reference if not regenerating the master
  let masterBase64: string | undefined, masterMime = 'image/png'
  if (!isMasterFrame && pkg.master_frame_url) {
    try {
      const res = await fetch(pkg.master_frame_url as string)
      if (res.ok) { masterBase64 = Buffer.from(await res.arrayBuffer()).toString('base64'); masterMime = res.headers.get('content-type') ?? 'image/png' }
    } catch { /* non-fatal */ }
  }

  let provider
  try { provider = requireP360Provider() } catch (err) {
    return { success: false, errorMessage: err instanceof Error ? err.message : 'No provider' }
  }

  try {
    const result = await provider.generateFrame({
      prompt: framePrompt,
      negativePrompt: pkg.negative_prompt as string | undefined || undefined,
      width: genConfig.outputWidth ?? 1024, height: genConfig.outputHeight ?? 1024,
      referenceImageBase64: masterBase64, referenceImageMimeType: masterMime,
    })

    const mimeType = result.mimeType ?? 'image/png'
    const ext = mimeType.includes('jpeg') ? 'jpg' : 'png'
    let uploadedUrl: string, storagePath: string

    if (result.imageBuffer) {
      const up = await uploadFrame({ tenantId, productId, packageId, frameIndex, buffer: result.imageBuffer, contentType: mimeType, ext })
      uploadedUrl = up.imageUrl; storagePath = up.storagePath
    } else if (result.imageUrl) {
      const r = await fetch(result.imageUrl)
      const buf = Buffer.from(await r.arrayBuffer())
      const up = await uploadFrame({ tenantId, productId, packageId, frameIndex, buffer: buf, contentType: r.headers.get('content-type') ?? mimeType, ext })
      uploadedUrl = up.imageUrl; storagePath = up.storagePath
    } else {
      throw new Error('Provider returned no image data')
    }

    const prevAttempt = (frame.generation_attempt as number) || 1
    await db.from('product_360_frames').update({
      image_url: uploadedUrl, storage_path: storagePath,
      angle_degrees: getFrameAngle(frameIndex, genConfig.frameCount),
      prompt_used: framePrompt.slice(0, 4000),
      generation_attempt: prevAttempt + 1,
      needs_regeneration: false,
      updated_at: new Date().toISOString(),
    }).eq('id', frameId)

    if (isMasterFrame) {
      await db.from('product_360_packages').update({
        master_frame_url: uploadedUrl, master_frame_generated: true,
        updated_at: new Date().toISOString(),
      }).eq('id', packageId)
    }

    return { success: true, imageUrl: uploadedUrl }
  } catch (err) {
    return { success: false, errorMessage: err instanceof Error ? err.message : 'Regeneration failed' }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Checks whether a user has requested cancellation for this package.
 * Queries the DB on every call — intentionally avoids caching so that a cancel
 * request made from another browser tab or session is always honoured.
 *
 * Returns true when the generation loop should stop immediately.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkCancellation(packageId: string, db: any): Promise<boolean> {
  const { data } = await db
    .from('product_360_packages')
    .select('cancel_requested, status')
    .eq('id', packageId)
    .maybeSingle()

  if (!data) return false
  return !!(data.cancel_requested) || data.status === 'cancelled'
}

async function markFailed(packageId: string, errorMessage: string): Promise<void> {
  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('product_360_packages')
    .update({ status: 'failed', generation_error: errorMessage, updated_at: new Date().toISOString() })
    .eq('id', packageId)
}
