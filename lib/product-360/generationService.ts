// lib/product-360/generationService.ts
// Orchestrates AI frame generation for a 360° package using Gemini.
// Runs server-side only. Never import from client components.
//
// Required env vars:
//   GEMINI_API_KEY          — Google AI API key
//   GEMINI_360_MODEL        — model (default: gemini-2.5-flash-lite)
//   PRODUCT_360_AI_PROVIDER — provider override (default: gemini)

import { getSupabaseServerClient }  from '@/lib/supabase/server'
import { requireP360Provider }      from '@/lib/ai/360/provider'
import { buildFullFramePlan, buildMasterPrompt } from '@/lib/ai/360/promptBuilder'
import { uploadFrame }              from './storage'
import { finalizePackage }          from './finalize'
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
 * Generate all frames for a 360° package.
 * Called by POST /api/product-360/packages/[id]/generate.
 * Awaitable — the route handler must await this to ensure DB finalization completes.
 * Status lifecycle: queued → generating → [frame loop] → processing → ready (or failed).
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
    frameCount:          (pkg.target_frame_count as number) || 36,
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

  const masterPrompt = buildMasterPrompt(productDescriptor, genConfig)
  const framePlan    = buildFullFramePlan(productDescriptor, genConfig)
  const totalFrames  = framePlan.length

  console.info(`[p360:generate] pkg=${packageId} starting ${totalFrames} frames via ${provider.name}`)

  const plannerModel = (process.env.GEMINI_360_PLANNER_MODEL ?? 'gemini-2.5-flash-lite').trim()

  // ── Mark generating — reset progress counters ────────────────────────────────
  await db
    .from('product_360_packages')
    .update({
      status:              'generating',
      generation_error:    null,
      generation_provider: provider.name,
      ai_model:            provider.model,
      planner_model:       plannerModel,
      frames_done:         0,
      progress_percent:    0,
      updated_at:          new Date().toISOString(),
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
      prompt:             masterPrompt,
      target_frame_count: genConfig.frameCount,
      started_at:         new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()

  const jobId = (jobRow as { id: string } | null)?.id

  let framesGenerated = 0

  try {
    for (const frame of framePlan) {
      const result = await provider.generateFrame({
        prompt:         frame.prompt,
        negativePrompt: (pkg.negative_prompt as string | undefined) || undefined,
        width:          genConfig.outputWidth  ?? 1024,
        height:         genConfig.outputHeight ?? 1024,
      })

      const mimeType = result.mimeType ?? 'image/png'
      const ext      = mimeType.includes('jpeg') ? 'jpg' : 'png'

      let uploadedUrl: string
      let storagePath: string

      if (result.imageBuffer) {
        const { imageUrl, storagePath: sp } = await uploadFrame({
          tenantId, productId, packageId,
          frameIndex:  frame.frameIndex,
          buffer:      result.imageBuffer,
          contentType: mimeType,
          ext,
        })
        uploadedUrl = imageUrl
        storagePath = sp
      } else if (result.imageUrl) {
        const fetchRes = await fetch(result.imageUrl)
        if (!fetchRes.ok) throw new Error(`Frame fetch failed (HTTP ${fetchRes.status})`)
        const buf = Buffer.from(await fetchRes.arrayBuffer())
        const { imageUrl, storagePath: sp } = await uploadFrame({
          tenantId, productId, packageId,
          frameIndex:  frame.frameIndex,
          buffer:      buf,
          contentType: fetchRes.headers.get('content-type') ?? mimeType,
          ext,
        })
        uploadedUrl = imageUrl
        storagePath = sp
      } else {
        throw new Error(`Frame ${frame.frameIndex}: provider returned neither buffer nor URL`)
      }

      // Persist frame row — upsert so reruns don't create duplicates
      await db
        .from('product_360_frames')
        .upsert({
          package_id:    packageId,
          tenant_id:     tenantId,
          product_id:    productId,
          frame_index:   frame.frameIndex,
          angle_degrees: frame.angleDeg,
          image_url:     uploadedUrl,
          storage_path:  storagePath,
          prompt_used:   frame.prompt,
          alt_text:      `${productDescriptor.name} – ${frame.shotDirection} view`,
          metadata:      { angleDeg: frame.angleDeg, shotDirection: frame.shotDirection },
        }, { onConflict: 'package_id,frame_index' })

      framesGenerated++

      console.info(`[p360:generate] pkg=${packageId} frame ${framesGenerated}/${totalFrames} done`)

      // ── Update progress in DB every 3 frames (or on the final frame) ────────
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

      // Update job progress
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
    // Translate common API errors into user-friendly messages
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

export async function regenerateSingleFrame(
  packageId: string,
  frameId:   string,
): Promise<RegenerateFrameResult> {
  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Load package + frame
  const [{ data: pkg }, { data: frame }] = await Promise.all([
    db.from('product_360_packages')
      .select('id, tenant_id, product_id, name, generation_prompt, generation_notes, negative_prompt, ai_model, lighting_preset, background_preset, category_preset, camera_preset, camera_distance, camera_height, fov, shadow_strength, reflection_intensity, turn_direction, output_width, output_height, target_frame_count')
      .eq('id', packageId).maybeSingle(),
    db.from('product_360_frames')
      .select('id, frame_index, angle_degrees, storage_path')
      .eq('id', frameId).eq('package_id', packageId).maybeSingle(),
  ])

  if (!pkg || !frame) return { success: false, errorMessage: 'Package or frame not found' }

  const tenantId  = pkg.tenant_id  as string
  const productId = pkg.product_id as string

  const { data: product } = await db
    .from('products')
    .select('name, description, category, attributes')
    .eq('id', productId).maybeSingle()

  const productDescriptor: P360ProductDescriptor = {
    name:        (pkg.name as string) || (product?.name as string) || 'Product',
    description: (product?.description as string) || '',
    category:    (product?.category as string) || undefined,
    attributes:  (product?.attributes as Record<string, string | number | boolean>) || undefined,
  }

  const genConfig: P360GenerationConfig = {
    frameCount:          (pkg.target_frame_count as number) || 36,
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

  const frameIndex = frame.frame_index as number
  const angleDeg   = frame.angle_degrees as number
  const framePlan  = buildFullFramePlan(productDescriptor, genConfig)
  const targetFrame = framePlan.find(f => f.frameIndex === frameIndex) ?? framePlan[0]

  let provider
  try { provider = requireP360Provider() } catch (err) {
    return { success: false, errorMessage: err instanceof Error ? err.message : 'No provider' }
  }

  try {
    const result = await provider.generateFrame({
      prompt:         targetFrame.prompt,
      negativePrompt: pkg.negative_prompt as string | undefined || undefined,
      width:          genConfig.outputWidth  ?? 1024,
      height:         genConfig.outputHeight ?? 1024,
    })

    const mimeType = result.mimeType ?? 'image/png'
    const ext      = mimeType.includes('jpeg') ? 'jpg' : 'png'

    let uploadedUrl: string
    let storagePath: string

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

    await db.from('product_360_frames').update({
      image_url:    uploadedUrl,
      storage_path: storagePath,
      angle_degrees: angleDeg,
      alt_text:     `${productDescriptor.name} – ${targetFrame.shotDirection} view`,
      updated_at:   new Date().toISOString(),
    }).eq('id', frameId)

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
