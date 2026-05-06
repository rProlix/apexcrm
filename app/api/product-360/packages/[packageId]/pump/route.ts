// app/api/product-360/packages/[packageId]/pump/route.ts
//
// POST — process exactly ONE pending frame for a 360° package.
//
// Design intent:
//   The /generate route can time out on Vercel Hobby (10 s) or Pro (300 s)
//   when generating large packages. This route is a "pump": the client calls
//   it repeatedly until it returns { done: true }, each call completing
//   one frame safely within the function timeout.
//
// Response shapes:
//   Frame generated:  { ok: true, data: { done: false, processedFrameIndex, remainingFrames, packageStatus, progressPercent } }
//   All done:         { ok: true, data: { done: true,  packageStatus: 'ready', progressPercent: 100 } }
//   Already done:     { ok: true, data: { done: true,  packageStatus, progressPercent } }
//   Cancelled:        { ok: true, data: { done: true,  packageStatus: 'cancelled' } }
//   Quota exceeded:   { ok: false, error: { type: 'quota_exceeded', ... } }
//   General failure:  { ok: false, error: { type, title, message } }

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
  buildSceneBlueprint,
  buildLockedGenerationPrompt,
  buildMasterFramePrompt,
  buildLockedFramePrompt,
  getFrameAngle,
  getShotDirection,
  type SceneBlueprint,
} from '@/lib/ai/360/buildLockedFramePrompt'
import type { P360GenerationConfig, P360ProductDescriptor } from '@/lib/ai/360/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 120  // seconds — one Imagen call typically completes in 10-30 s

type Ctx = { params: Promise<{ packageId: string }> }

/** Statuses from which the pump is allowed to operate. */
const PUMPABLE = new Set([
  'queued', 'planning', 'generating', 'processing', 'paused_quota', 'failed',
])

export async function POST(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params

  // ── Auth ──────────────────────────────────────────────────────────────────
  const user = await resolveP360ApiUser(req)
  if (!user) {
    return NextResponse.json({ ok: false, error: { type: 'auth_error', title: 'Unauthorized', message: 'Unauthorized' } }, { status: 401 })
  }
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: { type: 'auth_error', title: 'Forbidden', message: 'Only owners and admins may pump generation' } }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* body is optional */ }

  const tenantId = user.isOwner
    ? (body.tenantId as string | undefined) ?? user.tenantId
    : user.tenantId

  if (!tenantId) {
    return NextResponse.json({ ok: false, error: { type: 'invalid_request', title: 'Missing tenant', message: 'Could not resolve tenant' } }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // ── Load package ──────────────────────────────────────────────────────────
  const { data: pkg } = await db
    .from('product_360_packages')
    .select([
      'id', 'tenant_id', 'product_id', 'name', 'description',
      'status', 'cancel_requested',
      'target_frame_count', 'frames_done', 'progress_percent',
      'generation_prompt', 'generation_notes', 'negative_prompt',
      'ai_model', 'lighting_preset', 'background_preset', 'category_preset', 'camera_preset',
      'camera_distance', 'camera_height', 'fov', 'shadow_strength',
      'reflection_intensity', 'turn_direction', 'output_width', 'output_height',
      'scene_blueprint', 'locked_generation_prompt', 'master_frame_url',
      'master_frame_generated', 'retry_count',
    ].join(', '))
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!pkg) {
    return NextResponse.json({ ok: false, error: { type: 'not_found', title: 'Not found', message: 'Package not found or access denied' } }, { status: 404 })
  }

  const currentStatus = pkg.status as string

  // ── Already finished? ─────────────────────────────────────────────────────
  if (currentStatus === 'ready' || currentStatus === 'completed') {
    return NextResponse.json({ ok: true, data: { done: true, packageStatus: currentStatus, progressPercent: 100 } })
  }
  if (currentStatus === 'cancelled') {
    return NextResponse.json({ ok: true, data: { done: true, packageStatus: 'cancelled', progressPercent: pkg.progress_percent ?? 0 } })
  }
  if (currentStatus === 'archived') {
    return NextResponse.json({ ok: false, error: { type: 'invalid_request', title: 'Archived', message: 'Package is archived' } }, { status: 409 })
  }

  // ── Cancel check ─────────────────────────────────────────────────────────
  if (pkg.cancel_requested) {
    await db.from('product_360_packages').update({
      status:       'cancelled',
      cancelled_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    }).eq('id', packageId)
    return NextResponse.json({ ok: true, data: { done: true, packageStatus: 'cancelled', progressPercent: pkg.progress_percent ?? 0 } })
  }

  if (!PUMPABLE.has(currentStatus)) {
    return NextResponse.json({
      ok: false,
      error: { type: 'invalid_request', title: 'Cannot pump', message: `Package status "${currentStatus}" is not pumpable` },
    }, { status: 409 })
  }

  // ── Provider check ────────────────────────────────────────────────────────
  let provider
  try {
    provider = requireP360Provider()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI provider not configured'
    await db.from('product_360_packages').update({
      status: 'failed', generation_error: msg, last_error_message: msg, updated_at: new Date().toISOString(),
    }).eq('id', packageId)
    return NextResponse.json({ ok: false, error: { type: 'auth_error', title: 'AI not configured', message: msg } }, { status: 503 })
  }

  const tenantIdPkg  = pkg.tenant_id  as string
  const productId    = pkg.product_id as string | null

  if (!productId) {
    const msg = 'Package has no product attached'
    await db.from('product_360_packages').update({
      status: 'failed', generation_error: msg, last_error_message: msg, updated_at: new Date().toISOString(),
    }).eq('id', packageId)
    return NextResponse.json({ ok: false, error: { type: 'invalid_request', title: 'No product', message: msg } }, { status: 422 })
  }

  // ── Load product ──────────────────────────────────────────────────────────
  const { data: product } = await db
    .from('products')
    .select('name, description, category, attributes')
    .eq('id', productId)
    .maybeSingle()

  const productDescriptor: P360ProductDescriptor = {
    name:        (pkg.name as string) || (product?.name as string) || 'Product',
    description: (product?.description as string) || (pkg.description as string) || '',
    category:    (product?.category as string) || undefined,
    attributes:  (product?.attributes as Record<string, string | number | boolean>) || undefined,
  }

  const totalFrames = Math.min(
    (pkg.target_frame_count as number) || 12,
    parseInt(process.env.MAX_360_FRAMES_PER_PACKAGE ?? '24', 10) || 24,
  )

  const genConfig: P360GenerationConfig = {
    frameCount:          totalFrames,
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

  const subject = normalizeProductSubject(
    productDescriptor.name,
    productDescriptor.description,
    genConfig.categoryPreset,
  )

  const blueprint: SceneBlueprint =
    (pkg.scene_blueprint as SceneBlueprint | null) ?? buildSceneBlueprint(subject, genConfig)

  const lockedPrompt: string =
    (pkg.locked_generation_prompt as string | null) ?? buildLockedGenerationPrompt(subject, genConfig, blueprint)

  // ── Transition package to 'generating' ───────────────────────────────────
  if (currentStatus !== 'generating') {
    const { error: statusErr } = await db
      .from('product_360_packages')
      .update({ status: 'generating', updated_at: new Date().toISOString() })
      .eq('id', packageId)

    if (statusErr) {
      console.error(`[p360:pump] pkg=${packageId} Failed to update to 'generating': ${statusErr.message}`)
      return NextResponse.json({
        ok: false,
        error: { type: 'db_error', title: 'DB error', message: statusErr.message },
      }, { status: 500 })
    }
  }

  // ── Find next frame to process ────────────────────────────────────────────
  const { data: existingFrames } = await db
    .from('product_360_frames')
    .select('frame_index, image_url, status')
    .eq('package_id', packageId)
    .order('frame_index', { ascending: true })

  const frames = (existingFrames ?? []) as Array<{ frame_index: number; image_url: string | null; status: string }>
  const completedSet = new Set(frames.filter(f => !!f.image_url).map(f => f.frame_index))

  // Find the lowest missing frame index
  let nextFrameIndex = -1
  for (let i = 0; i < totalFrames; i++) {
    if (!completedSet.has(i)) { nextFrameIndex = i; break }
  }

  // ── All frames already complete? ──────────────────────────────────────────
  if (nextFrameIndex === -1) {
    console.info(`[p360:pump] pkg=${packageId} all ${totalFrames} frames complete — finalizing`)
    await db.from('product_360_packages').update({
      status: 'processing', frames_done: totalFrames, progress_percent: 100,
      frame_count: totalFrames, updated_at: new Date().toISOString(),
    }).eq('id', packageId)

    const fin = await finalizePackage(packageId)
    await db.from('product_360_packages').update({
      generation_completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', packageId)

    if (!fin.success) {
      return NextResponse.json({ ok: false, error: { type: 'unknown', title: 'Finalize failed', message: fin.errorMessage ?? 'Finalize failed' } }, { status: 500 })
    }
    return NextResponse.json({ ok: true, data: { done: true, packageStatus: 'ready', progressPercent: 100, previewUrl: fin.previewUrl } })
  }

  // ── Generate the selected frame ───────────────────────────────────────────
  const isMasterFrame = nextFrameIndex === 0
  const angleDeg      = getFrameAngle(nextFrameIndex, totalFrames)
  const shotDirection = getShotDirection(angleDeg)

  const framePrompt = isMasterFrame
    ? buildMasterFramePrompt(subject, genConfig, blueprint)
    : buildLockedFramePrompt(lockedPrompt, angleDeg, nextFrameIndex, totalFrames, shotDirection)

  console.info(`[p360:pump] pkg=${packageId} frame=${nextFrameIndex}/${totalFrames} angle=${angleDeg}° isMaster=${isMasterFrame}`)

  // Mark frame as 'generating' before API call
  await db.from('product_360_frames').upsert({
    package_id: packageId, tenant_id: tenantIdPkg, product_id: productId,
    frame_index: nextFrameIndex, angle_degrees: angleDeg,
    status: 'generating',
    generation_started_at: new Date().toISOString(),
    is_master_frame: isMasterFrame,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'package_id,frame_index' })

  // Load master frame as reference image for non-master frames
  let masterBase64: string | undefined, masterMime = 'image/png'
  const storedMasterUrl = pkg.master_frame_url as string | null
  if (!isMasterFrame && storedMasterUrl) {
    try {
      const res = await fetch(storedMasterUrl)
      if (res.ok) {
        masterBase64 = Buffer.from(await res.arrayBuffer()).toString('base64')
        masterMime   = res.headers.get('content-type') ?? 'image/png'
      }
    } catch { /* non-fatal — proceed without reference */ }
  }

  try {
    const result = await provider.generateFrame({
      prompt:                 framePrompt,
      width:                  genConfig.outputWidth  ?? 1024,
      height:                 genConfig.outputHeight ?? 1024,
      referenceImageBase64:   masterBase64,
      referenceImageMimeType: masterMime,
    })

    const mimeType = result.mimeType ?? 'image/png'
    const ext      = mimeType.includes('jpeg') ? 'jpg' : 'png'
    let uploadedUrl: string, storagePath: string

    if (result.imageBuffer) {
      const up = await uploadFrame({ tenantId: tenantIdPkg, productId, packageId, frameIndex: nextFrameIndex, buffer: result.imageBuffer, contentType: mimeType, ext })
      uploadedUrl = up.imageUrl; storagePath = up.storagePath
    } else if (result.imageUrl) {
      const fetchRes = await fetch(result.imageUrl)
      if (!fetchRes.ok) throw new Error(`Frame fetch failed (HTTP ${fetchRes.status})`)
      const buf = Buffer.from(await fetchRes.arrayBuffer())
      const up  = await uploadFrame({ tenantId: tenantIdPkg, productId, packageId, frameIndex: nextFrameIndex, buffer: buf, contentType: fetchRes.headers.get('content-type') ?? mimeType, ext })
      uploadedUrl = up.imageUrl; storagePath = up.storagePath
    } else {
      throw new Error('Provider returned neither buffer nor URL')
    }

    // Save completed frame
    await db.from('product_360_frames').upsert({
      package_id: packageId, tenant_id: tenantIdPkg, product_id: productId,
      frame_index: nextFrameIndex, angle_degrees: angleDeg,
      image_url: uploadedUrl, storage_path: storagePath,
      status: 'completed',
      prompt_used: framePrompt.slice(0, 4000),
      is_master_frame: isMasterFrame, generation_attempt: 1,
      alt_text: `${subject.name} – ${shotDirection} view`,
      metadata: { angleDeg, shotDirection, isMaster: isMasterFrame },
      generation_finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'package_id,frame_index' })

    const newDone       = completedSet.size + 1
    const progressPct   = Math.min(100, Math.round((newDone / totalFrames) * 100))
    const remainingFrames = totalFrames - newDone

    // Update package master_frame_url + progress
    const pkgUpdate: Record<string, unknown> = {
      frames_done:               newDone,
      progress_percent:          progressPct,
      last_generated_at:         new Date().toISOString(),
      last_generation_heartbeat: new Date().toISOString(),
      updated_at:                new Date().toISOString(),
    }
    if (isMasterFrame) {
      pkgUpdate.master_frame_url       = uploadedUrl
      pkgUpdate.master_frame_generated = true
    }
    await db.from('product_360_packages').update(pkgUpdate).eq('id', packageId)

    console.info(`[p360:pump] pkg=${packageId} frame=${nextFrameIndex} done (${newDone}/${totalFrames})`)

    // All frames done → finalize
    if (remainingFrames === 0) {
      await db.from('product_360_packages').update({
        status: 'processing', frame_count: totalFrames, updated_at: new Date().toISOString(),
      }).eq('id', packageId)
      const fin = await finalizePackage(packageId)
      await db.from('product_360_packages').update({
        generation_completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', packageId)
      if (!fin.success) {
        return NextResponse.json({ ok: false, error: { type: 'unknown', title: 'Finalize failed', message: fin.errorMessage ?? 'Finalize failed' } }, { status: 500 })
      }
      return NextResponse.json({
        ok: true,
        data: { done: true, packageStatus: 'ready', progressPercent: 100, previewUrl: fin.previewUrl },
      })
    }

    return NextResponse.json({
      ok: true,
      data: {
        done:                false,
        processedFrameIndex: nextFrameIndex,
        remainingFrames,
        packageStatus:       'generating',
        progressPercent:     progressPct,
        imageUrl:            uploadedUrl,
      },
    })

  } catch (err) {
    // ── 429 quota exceeded ─────────────────────────────────────────────────
    if (err instanceof ImagenApiError && err.statusCode === 429) {
      const normalized = normalizeAiError(429, err instanceof Error ? err.message : '429')
      const retryAt    = normalized.retryAfter
        ? new Date(Date.now() + normalized.retryAfter * 1000).toISOString()
        : null

      await db.from('product_360_frames').update({
        status: 'pending', updated_at: new Date().toISOString(),
      }).eq('package_id', packageId).eq('frame_index', nextFrameIndex)

      await db.from('product_360_packages').update({
        status: 'paused_quota',
        generation_error:   normalized.message,
        last_error_type:    'quota_exceeded',
        last_error_at:      new Date().toISOString(),
        last_error_message: normalized.message,
        next_retry_at:      retryAt,
        retry_count:        ((pkg.retry_count as number) ?? 0) + 1,
        updated_at:         new Date().toISOString(),
      }).eq('id', packageId)

      console.warn(`[p360:pump] pkg=${packageId} 429 quota paused at frame ${nextFrameIndex}`)
      return NextResponse.json({
        ok: false,
        error: {
          type:      'quota_exceeded',
          title:     'Image generation quota reached',
          message:   normalized.message,
          retryable: true,
          retryAt,
        },
      }, { status: 429 })
    }

    // ── General failure ────────────────────────────────────────────────────
    const errMsg = err instanceof Error ? err.message : 'Frame generation failed'
    console.error(`[p360:pump] pkg=${packageId} frame=${nextFrameIndex} failed:`, errMsg)

    await db.from('product_360_frames').update({
      status: 'failed', error_message: errMsg, updated_at: new Date().toISOString(),
    }).eq('package_id', packageId).eq('frame_index', nextFrameIndex)

    await db.from('product_360_packages').update({
      status:             'failed',
      generation_error:   errMsg,
      last_error_message: errMsg,
      last_error_at:      new Date().toISOString(),
      updated_at:         new Date().toISOString(),
    }).eq('id', packageId)

    return NextResponse.json({
      ok: false,
      error: { type: 'unknown', title: 'Frame generation failed', message: errMsg },
    }, { status: 500 })
  }
}
