// lib/product-360/generationService.ts
// Orchestrates AI frame generation for a 360° package using the locked pipeline.
//
// ═══════════════════════════════════════════════════════════════════════
// 3-STAGE LOCKED GENERATION PIPELINE (visual consistency fix)
// ═══════════════════════════════════════════════════════════════════════
//
//  Stage A — MASTER FRAME
//    Generate frame 0 (0°) with buildMasterFramePrompt().
//    Save its URL as master_frame_url on the package.
//    This becomes the canonical visual blueprint for the package.
//
//  Stage B — LOCKED SCENE SPEC
//    Build a structured SceneBlueprint JSON from product + config.
//    Build a locked_generation_prompt text template from the blueprint.
//    Save both to the package (done BEFORE any generation begins).
//
//  Stage C — LOCKED FRAME GENERATION
//    For every frame 1..N, use buildLockedFramePrompt() which injects
//    the complete locked_generation_prompt and the single per-frame instruction:
//    "only change the orbit angle to X degrees."
//    Optionally passes master_frame base64 as a reference image.
//
// ═══════════════════════════════════════════════════════════════════════
//
// Required env vars:
//   GEMINI_API_KEY          — Google AI API key
//   GEMINI_360_MODEL        — model (default: gemini-2.5-flash-lite)
//   PRODUCT_360_AI_PROVIDER — provider override (default: imagen)
//
// SERVER-ONLY. Never import from client components.

import { getSupabaseServerClient }  from '@/lib/supabase/server'
import { requireP360Provider }      from '@/lib/ai/360/provider'
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
import type { P360GenerationConfig, P360ProductDescriptor } from '@/lib/ai/360/types'

export interface GeneratePackageResult {
  success:          boolean
  framesGenerated:  number
  previewUrl?:      string | null
  errorMessage?:    string
}

export interface RegenerateFrameResult {
  success:     boolean
  imageUrl?:   string
  errorMessage?: string
}

// ─── Main generation pipeline ─────────────────────────────────────────────────

/**
 * Generate all frames for a 360° package using the 3-stage locked pipeline.
 *
 * Called by POST /api/product-360/packages/[id]/generate.
 * Awaitable — the route handler must await this to ensure DB finalization completes.
 *
 * Status lifecycle: queued → generating → [frame loop] → processing → ready (or failed)
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
      'consistency_mode',
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

  // ── Build generation config ──────────────────────────────────────────────────
  const genConfig: P360GenerationConfig = {
    frameCount:          (pkg.target_frame_count as number) || 24,
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

  const totalFrames  = genConfig.frameCount
  const plannerModel = (process.env.GEMINI_360_PLANNER_MODEL ?? 'gemini-2.5-flash-lite').trim()

  // ── Stage B (pre-generation): Normalize product + build locked scene spec ────
  const subject  = normalizeProductSubject(
    productDescriptor.name,
    productDescriptor.description,
    genConfig.categoryPreset,
  )
  const blueprint: SceneBlueprint = buildSceneBlueprint(subject, genConfig)
  const lockedPrompt = buildLockedGenerationPrompt(subject, genConfig, blueprint)

  console.info(
    `[p360:generate] pkg=${packageId} product="${subject.name}" ` +
    `category=${subject.productCategory} vessel=${subject.vessel} ` +
    `ingredients=${subject.ingredients.length} garnish=${subject.garnish.length}`,
  )

  // ── Mark generating — reset progress, save blueprint ────────────────────────
  await db
    .from('product_360_packages')
    .update({
      status:                    'generating',
      generation_error:          null,
      generation_provider:       provider.name,
      ai_model:                  provider.model,
      planner_model:             plannerModel,
      frames_done:               0,
      progress_percent:          0,
      scene_blueprint:           blueprint,
      locked_generation_prompt:  lockedPrompt,
      master_frame_generated:    false,
      master_frame_url:          null,
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
      target_frame_count: genConfig.frameCount,
      started_at:         new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()

  const jobId = (jobRow as { id: string } | null)?.id

  let framesGenerated  = 0
  let masterFrameBase64: string | undefined
  let masterFrameMime   = 'image/png'

  console.info(`[p360:generate] pkg=${packageId} — starting ${totalFrames} frames via ${provider.name}`)

  try {
    // ══════════════════════════════════════════════════════════════════
    // STAGE A — Generate the master frame (frame 0, angle 0°)
    // ══════════════════════════════════════════════════════════════════

    const masterPrompt = buildMasterFramePrompt(subject, genConfig, blueprint)

    console.info(`[p360:generate] pkg=${packageId} STAGE A: generating master frame (0°)…`)

    const masterResult = await provider.generateFrame({
      prompt:  masterPrompt,
      width:   genConfig.outputWidth  ?? 1024,
      height:  genConfig.outputHeight ?? 1024,
    })

    const masterMime     = masterResult.mimeType ?? 'image/png'
    const masterExt      = masterMime.includes('jpeg') ? 'jpg' : 'png'
    let   masterBuffer:  Buffer
    let   masterUrl:     string
    let   masterPath:    string

    if (masterResult.imageBuffer) {
      masterBuffer = masterResult.imageBuffer
      const up = await uploadFrame({
        tenantId, productId, packageId,
        frameIndex:  0,
        buffer:      masterBuffer,
        contentType: masterMime,
        ext:         masterExt,
      })
      masterUrl  = up.imageUrl
      masterPath = up.storagePath
    } else if (masterResult.imageUrl) {
      const fetchRes = await fetch(masterResult.imageUrl)
      if (!fetchRes.ok) throw new Error(`Master frame fetch failed (HTTP ${fetchRes.status})`)
      masterBuffer = Buffer.from(await fetchRes.arrayBuffer())
      const up = await uploadFrame({
        tenantId, productId, packageId,
        frameIndex:  0,
        buffer:      masterBuffer,
        contentType: fetchRes.headers.get('content-type') ?? masterMime,
        ext:         masterExt,
      })
      masterUrl  = up.imageUrl
      masterPath = up.storagePath
    } else {
      throw new Error('Master frame: provider returned neither buffer nor URL')
    }

    // Keep base64 in memory for use as reference image in Stage C
    masterFrameBase64 = masterBuffer.toString('base64')
    masterFrameMime   = masterMime

    // Upsert master frame row
    await db
      .from('product_360_frames')
      .upsert({
        package_id:         packageId,
        tenant_id:          tenantId,
        product_id:         productId,
        frame_index:        0,
        angle_degrees:      0,
        image_url:          masterUrl,
        storage_path:       masterPath,
        prompt_used:        masterPrompt,
        is_master_frame:    true,
        generation_attempt: 1,
        alt_text:           `${subject.name} – front view (master)`,
        metadata:           { angleDeg: 0, shotDirection: 'front', isMaster: true },
      }, { onConflict: 'package_id,frame_index' })

    // Save master_frame_url to the package
    await db
      .from('product_360_packages')
      .update({
        master_frame_url:       masterUrl,
        master_frame_generated: true,
        frames_done:            1,
        progress_percent:       Math.round((1 / totalFrames) * 100),
        updated_at:             new Date().toISOString(),
      })
      .eq('id', packageId)

    framesGenerated = 1
    console.info(`[p360:generate] pkg=${packageId} STAGE A complete: master_frame_url=${masterUrl}`)

    // ══════════════════════════════════════════════════════════════════
    // STAGE C — Generate remaining frames using locked prompts
    // ══════════════════════════════════════════════════════════════════

    for (let frameIndex = 1; frameIndex < totalFrames; frameIndex++) {
      const angleDeg      = getFrameAngle(frameIndex, totalFrames)
      const shotDirection = getShotDirection(angleDeg)

      const framePrompt = buildLockedFramePrompt(
        lockedPrompt,
        angleDeg,
        frameIndex,
        totalFrames,
        shotDirection,
      )

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
        const up = await uploadFrame({
          tenantId, productId, packageId,
          frameIndex,
          buffer:      frameResult.imageBuffer,
          contentType: mimeType,
          ext,
        })
        uploadedUrl = up.imageUrl
        storagePath = up.storagePath
      } else if (frameResult.imageUrl) {
        const fetchRes = await fetch(frameResult.imageUrl)
        if (!fetchRes.ok) throw new Error(`Frame ${frameIndex} fetch failed (HTTP ${fetchRes.status})`)
        const buf = Buffer.from(await fetchRes.arrayBuffer())
        const up  = await uploadFrame({
          tenantId, productId, packageId,
          frameIndex,
          buffer:      buf,
          contentType: fetchRes.headers.get('content-type') ?? mimeType,
          ext,
        })
        uploadedUrl = up.imageUrl
        storagePath = up.storagePath
      } else {
        throw new Error(`Frame ${frameIndex}: provider returned neither buffer nor URL`)
      }

      // Upsert frame row
      await db
        .from('product_360_frames')
        .upsert({
          package_id:         packageId,
          tenant_id:          tenantId,
          product_id:         productId,
          frame_index:        frameIndex,
          angle_degrees:      angleDeg,
          image_url:          uploadedUrl,
          storage_path:       storagePath,
          prompt_used:        framePrompt.slice(0, 4000),
          is_master_frame:    false,
          generation_attempt: 1,
          alt_text:           `${subject.name} – ${shotDirection} view`,
          metadata:           { angleDeg, shotDirection },
        }, { onConflict: 'package_id,frame_index' })

      framesGenerated++

      console.info(
        `[p360:generate] pkg=${packageId} frame ${framesGenerated}/${totalFrames} done (${angleDeg}°)`,
      )

      // Update progress every 3 frames or on the final frame
      if (framesGenerated % 3 === 0 || framesGenerated === totalFrames) {
        const progressPct = Math.min(100, Math.round((framesGenerated / totalFrames) * 100))
        await db
          .from('product_360_packages')
          .update({
            frames_done:      framesGenerated,
            progress_percent: progressPct,
            updated_at:       new Date().toISOString(),
          })
          .eq('id', packageId)
      }

      if (jobId) {
        await db
          .from('product_360_generation_jobs')
          .update({ frames_completed: framesGenerated })
          .eq('id', jobId)
      }
    }

    // ── All frames generated — transition to processing, then finalize ────────
    await db
      .from('product_360_packages')
      .update({
        status:           'processing',
        frames_done:      framesGenerated,
        progress_percent: 100,
        frame_count:      framesGenerated,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', packageId)

    console.info(`[p360:generate] pkg=${packageId} → processing, calling finalize…`)

    const fin = await finalizePackage(packageId)

    if (jobId) {
      await db
        .from('product_360_generation_jobs')
        .update({
          status:           fin.success ? 'completed' : 'failed',
          frames_completed: framesGenerated,
          error_message:    fin.errorMessage ?? null,
          completed_at:     new Date().toISOString(),
        })
        .eq('id', jobId)
    }

    if (!fin.success) {
      return { success: false, framesGenerated, previewUrl: null, errorMessage: fin.errorMessage }
    }

    console.info(`[p360:generate] pkg=${packageId} → ready (${framesGenerated} frames)`)
    return { success: true, framesGenerated, previewUrl: fin.previewUrl }

  } catch (err) {
    let errorMessage = err instanceof Error ? err.message : 'Unknown generation error'

    if (errorMessage.includes('text output') || errorMessage.includes('text only')) {
      errorMessage = 'The selected AI model only supports text output. ' +
        'Image generation requires an Imagen model (imagen-4.0-ultra-generate-001). ' +
        'Check your PRODUCT_360_AI_PROVIDER and P360_IMAGEN_MODEL environment variables.'
    } else if (errorMessage.includes('GEMINI_API_KEY') || errorMessage.includes('GOOGLE_API_KEY') || errorMessage.includes('Missing')) {
      errorMessage = 'Missing Gemini/Google API key on the server. ' +
        'Add GEMINI_API_KEY to your Vercel Production and Preview environment variables.'
    } else if (errorMessage.includes('upload') || errorMessage.includes('Storage')) {
      errorMessage = 'Image generated but failed to upload to Supabase Storage. ' + errorMessage
    } else if (errorMessage.includes('403') || errorMessage.includes('access denied')) {
      errorMessage = 'Imagen API access denied. Ensure GEMINI_API_KEY has the Imagen API enabled in Google Cloud Console.'
    }

    console.error(`[p360:generate] pkg=${packageId} failed after ${framesGenerated} frames:`, err)
    await markFailed(packageId, errorMessage)

    if (jobId) {
      await db
        .from('product_360_generation_jobs')
        .update({
          status:        'failed',
          error_message: errorMessage,
          completed_at:  new Date().toISOString(),
        })
        .eq('id', jobId)
    }

    return { success: false, framesGenerated, previewUrl: null, errorMessage }
  }
}

// ─── Single-frame regeneration ────────────────────────────────────────────────

/**
 * Regenerate a single frame using the package's locked scene prompt.
 * For the master frame (frame_index=0), uses buildMasterFramePrompt.
 * For all other frames, uses the stored locked_generation_prompt.
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
      .eq('id', packageId)
      .maybeSingle(),
    db.from('product_360_frames')
      .select('id, frame_index, angle_degrees, storage_path, generation_attempt, is_master_frame')
      .eq('id', frameId)
      .eq('package_id', packageId)
      .maybeSingle(),
  ])

  if (!pkg || !frame) return { success: false, errorMessage: 'Package or frame not found' }

  const tenantId  = pkg.tenant_id  as string
  const productId = pkg.product_id as string

  const { data: product } = await db
    .from('products')
    .select('name, description, category, attributes')
    .eq('id', productId)
    .maybeSingle()

  const productDescriptor: P360ProductDescriptor = {
    name:        (pkg.name as string) || (product?.name as string) || 'Product',
    description: (product?.description as string) || '',
    category:    (product?.category as string) || undefined,
    attributes:  (product?.attributes as Record<string, string | number | boolean>) || undefined,
  }

  const genConfig: P360GenerationConfig = {
    frameCount:          (pkg.target_frame_count as number) || 24,
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
  const isMasterFrame = frame.is_master_frame as boolean || frameIndex === 0

  // Build the appropriate prompt
  let framePrompt: string
  if (isMasterFrame) {
    const subject  = normalizeProductSubject(productDescriptor.name, productDescriptor.description, genConfig.categoryPreset)
    const bp       = (pkg.scene_blueprint as SceneBlueprint | null) ?? buildSceneBlueprint(subject, genConfig)
    framePrompt    = buildMasterFramePrompt(subject, genConfig, bp)
  } else {
    const subject        = normalizeProductSubject(productDescriptor.name, productDescriptor.description, genConfig.categoryPreset)
    const bp             = (pkg.scene_blueprint as SceneBlueprint | null) ?? buildSceneBlueprint(subject, genConfig)
    const storedLocked   = (pkg.locked_generation_prompt as string | null)
                           ?? buildLockedGenerationPrompt(subject, genConfig, bp)
    const angleDeg       = getFrameAngle(frameIndex, genConfig.frameCount)
    const shotDirection  = getShotDirection(angleDeg)
    framePrompt = buildLockedFramePrompt(storedLocked, angleDeg, frameIndex, genConfig.frameCount, shotDirection)
  }

  // Fetch master frame for reference (if not regenerating the master itself)
  let masterBase64: string | undefined
  let masterMime   = 'image/png'
  if (!isMasterFrame && pkg.master_frame_url) {
    try {
      const res = await fetch(pkg.master_frame_url as string)
      if (res.ok) {
        const buf = await res.arrayBuffer()
        masterBase64 = Buffer.from(buf).toString('base64')
        masterMime   = res.headers.get('content-type') ?? 'image/png'
      }
    } catch {
      // Reference image fetch failed — proceed without it
    }
  }

  let provider
  try { provider = requireP360Provider() } catch (err) {
    return { success: false, errorMessage: err instanceof Error ? err.message : 'No provider' }
  }

  try {
    const result = await provider.generateFrame({
      prompt:                 framePrompt,
      negativePrompt:         pkg.negative_prompt as string | undefined || undefined,
      width:                  genConfig.outputWidth  ?? 1024,
      height:                 genConfig.outputHeight ?? 1024,
      referenceImageBase64:   masterBase64,
      referenceImageMimeType: masterMime,
    })

    const mimeType = result.mimeType ?? 'image/png'
    const ext      = mimeType.includes('jpeg') ? 'jpg' : 'png'
    let   uploadedUrl: string
    let   storagePath: string

    if (result.imageBuffer) {
      const up = await uploadFrame({ tenantId, productId, packageId, frameIndex, buffer: result.imageBuffer, contentType: mimeType, ext })
      uploadedUrl = up.imageUrl; storagePath = up.storagePath
    } else if (result.imageUrl) {
      const r   = await fetch(result.imageUrl)
      const buf = Buffer.from(await r.arrayBuffer())
      const up  = await uploadFrame({ tenantId, productId, packageId, frameIndex, buffer: buf, contentType: r.headers.get('content-type') ?? mimeType, ext })
      uploadedUrl = up.imageUrl; storagePath = up.storagePath
    } else {
      throw new Error('Provider returned no image data')
    }

    const prevAttempt = (frame.generation_attempt as number) || 1
    await db.from('product_360_frames').update({
      image_url:          uploadedUrl,
      storage_path:       storagePath,
      angle_degrees:      getFrameAngle(frameIndex, genConfig.frameCount),
      prompt_used:        framePrompt.slice(0, 4000),
      generation_attempt: prevAttempt + 1,
      needs_regeneration: false,
      updated_at:         new Date().toISOString(),
    }).eq('id', frameId)

    // If this was the master frame, update master_frame_url
    if (isMasterFrame) {
      await db.from('product_360_packages').update({
        master_frame_url:       uploadedUrl,
        master_frame_generated: true,
        updated_at:             new Date().toISOString(),
      }).eq('id', packageId)
    }

    return { success: true, imageUrl: uploadedUrl }
  } catch (err) {
    return { success: false, errorMessage: err instanceof Error ? err.message : 'Regeneration failed' }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function markFailed(packageId: string, errorMessage: string): Promise<void> {
  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('product_360_packages')
    .update({ status: 'failed', generation_error: errorMessage, updated_at: new Date().toISOString() })
    .eq('id', packageId)
}
