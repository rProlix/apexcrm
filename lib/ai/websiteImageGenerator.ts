// lib/ai/websiteImageGenerator.ts
// Calls the Imagen 4 Ultra API and stores the result in Supabase Storage.
// SERVER-ONLY — never import in client components.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  getWebsiteImageModel,
  WEBSITE_IMAGE_BUCKET,
  buildImageStoragePath,
} from '@/lib/ai/websiteImageConfig'
import { enhancePromptForImagen } from '@/lib/ai/websiteImagePrompts'
import { normalizeImagenAspectRatio } from '@/lib/website-ai/imagenAspectRatios'
import {
  isSchemaCacheError,
  isFkCreatedByError,
  buildTableMissingMessage,
  extractMissingTableName,
  MISSING_BUCKET_MESSAGE,
  isQuotaError,
  QUOTA_EXCEEDED_MESSAGE,
} from '@/lib/website-ai/imagePipelineErrors'
import type { WebsiteImagePlan } from '@/lib/ai/websiteImageTypes'
import {
  mergeNegativePromptIntoPrompt,
  stripUnsupportedImagenFields,
} from '@/lib/ai/promptSafety'
import { assertNoUnsupportedImagenFields } from '@/lib/ai/assertNoUnsupportedImagenFields'

const IMAGEN_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const TIMEOUT_MS      = 120_000

// ── Safe logger — never logs API keys or secrets ──────────────────────────────

function log(step: string, data: Record<string, unknown>) {
  console.log(`[AI-IMAGE] ${step}`, JSON.stringify(data, null, 2))
}

function logError(step: string, error: unknown, context: Record<string, unknown> = {}) {
  console.error(`[AI-IMAGE][ERROR] ${step}`, JSON.stringify({
    ...context,
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
  }, null, 2))
}

// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateImageOptions {
  plan:         WebsiteImagePlan
  tenantId:     string
  businessType: string | null
  createdBy?:   string | null
  /** How many images to generate (1–5). Default: 1. */
  imageCount?:  number
  /** Stored as requested_aspect_ratio for history; plan.aspect_ratio is normalized. */
  requestedAspectRatio?: string | null
}

export interface GenerateImageResult {
  jobId:              string
  publicUrl:          string
  storagePath:        string
  altText:            string
  error?:             string
  /** The normalized aspect ratio actually sent to Imagen */
  aspectRatio?:       string
  /** Note when the ratio was changed from the plan's stored value */
  aspectRatioNote?:   string
}

export async function generateWebsiteImage(
  opts: GenerateImageOptions,
): Promise<GenerateImageResult> {
  const supabase = getSupabaseServerClient()
  const model    = getWebsiteImageModel()
  const apiKey   = process.env.GEMINI_API_KEY

  log('1_plan_loaded', {
    planId:       opts.plan.id,
    tenantId:     opts.tenantId,
    sectionId:    opts.plan.section_id,
    pageId:       opts.plan.page_id,
    placementKey: opts.plan.placement_key,
    imageRole:    opts.plan.image_role,
    sectionType:  opts.plan.section_type,
    model,
    hasApiKey:    !!apiKey,
    bucket:       WEBSITE_IMAGE_BUCKET,
  })

  // ── Create the job record ─────────────────────────────────────────────────
  // safeAspectRatio is defined above this in the generator flow — use it here too.
  // (We redeclare it here for the early job insert which runs before the Imagen call)
  const jobSafeRatio = normalizeImagenAspectRatio(opts.plan.aspect_ratio, opts.plan.section_type)

  const { data: job, error: jobErr } = await supabase
    .from('website_image_jobs')
    .insert({
      tenant_id:       opts.tenantId,
      plan_id:         opts.plan.id,
      status:          'generating',
      model,
      prompt:          opts.plan.prompt,
      negative_prompt: opts.plan.negative_prompt,
      aspect_ratio:    jobSafeRatio,
      image_role:      opts.plan.image_role,
      placement_key:   opts.plan.placement_key,
      created_by:      opts.createdBy ?? null,
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    logError('1_create_job_failed', jobErr, { tenantId: opts.tenantId, planId: opts.plan.id })
    if (isSchemaCacheError(jobErr)) {
      // Identify which table is missing — may be website_image_jobs, not website_image_plans
      const tbl = extractMissingTableName(jobErr)
      return {
        jobId: '', publicUrl: '', storagePath: '', altText: '',
        error: buildTableMissingMessage(tbl ?? 'website_image_jobs'),
      }
    }
    if (isFkCreatedByError(jobErr)) {
      const fkMsg = 'Image job creation failed: created_by foreign key violation. Re-run migration 054 to make created_by nullable, or ensure auth_id is a valid auth.users UUID.'
      return { jobId: '', publicUrl: '', storagePath: '', altText: '', error: fkMsg }
    }
    return {
      jobId: '', publicUrl: '', storagePath: '', altText: '',
      error: `Failed to create image job record: ${jobErr?.message ?? 'unknown error'}`,
    }
  }

  const jobId = job.id
  log('2_job_created', { jobId, planId: opts.plan.id, tenantId: opts.tenantId })

  // ── Check API key ─────────────────────────────────────────────────────────
  if (!apiKey) {
    const msg = 'GEMINI_API_KEY is not set. Cannot call Imagen API.'
    logError('2_missing_api_key', new Error(msg), { jobId })
    await failJob(supabase, jobId, opts.plan.id, msg, null)
    return { jobId, publicUrl: '', storagePath: '', altText: '', error: msg }
  }

  // ── Build prompt ──────────────────────────────────────────────────────────
  // Imagen 4 removed negativePrompt support (HTTP 400 INVALID_ARGUMENT).
  // Merge any avoidance constraints into the positive prompt instead.
  const basePrompt  = enhancePromptForImagen(opts.plan.prompt, opts.plan.image_role, opts.businessType)
  const finalPrompt = mergeNegativePromptIntoPrompt(basePrompt, opts.plan.negative_prompt)

  // Always normalize the aspect ratio — Imagen 4 only supports: 1:1, 9:16, 16:9, 4:3, 3:4
  const safeAspectRatio = normalizeImagenAspectRatio(
    opts.plan.aspect_ratio,
    opts.plan.section_type,
  )

  const url  = `${IMAGEN_API_BASE}/${model}:predict?key=[REDACTED]`
  const rawBody = {
    instances: [{ prompt: finalPrompt }],
    parameters: {
      sampleCount:      opts.imageCount ?? 1,
      aspectRatio:      safeAspectRatio,
      personGeneration: 'dont_allow',
    },
  }
  // Defensive sanitizer + regression guard
  const body = stripUnsupportedImagenFields(rawBody)
  assertNoUnsupportedImagenFields(body)

  log('3_imagen_request_sent', {
    jobId,
    planId:       opts.plan.id,
    tenantId:     opts.tenantId,
    model,
    aspectRatio:  opts.plan.aspect_ratio ?? '16:9',
    promptLength: finalPrompt.length,
    endpoint:     url,
  })

  // ── Call Imagen API ───────────────────────────────────────────────────────
  let response: Response
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    response = await fetch(`${IMAGEN_API_BASE}/${model}:predict?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    })
  } catch (err: unknown) {
    clearTimeout(timer)
    const errMsg = err instanceof Error && err.name === 'AbortError'
      ? `Image generation timed out after ${TIMEOUT_MS / 1000}s. Try again.`
      : 'AI image generation is temporarily unavailable. Try again.'
    logError('3_imagen_request_failed', err, { jobId, planId: opts.plan.id })
    await failJob(supabase, jobId, opts.plan.id, errMsg, null)
    return { jobId, publicUrl: '', storagePath: '', altText: '', error: errMsg }
  } finally {
    clearTimeout(timer)
  }

  log('4_imagen_response_received', {
    jobId,
    status:        response.status,
    statusText:    response.statusText,
    contentType:   response.headers.get('content-type'),
  })

  if (!response.ok) {
    let errText = ''
    try { errText = await response.text() } catch { /* ignore */ }
    const errMsg = isQuotaError(errText)
      ? QUOTA_EXCEEDED_MESSAGE
      : `AI image generation failed (${response.status}). Try again.`
    logError('4_imagen_response_error', new Error(errMsg), { jobId, planId: opts.plan.id, status: response.status })
    await failJob(supabase, jobId, opts.plan.id, errMsg, errText.slice(0, 1000))
    return { jobId, publicUrl: '', storagePath: '', altText: '', error: errMsg }
  }

  // ── Parse response ────────────────────────────────────────────────────────
  let json: Record<string, unknown>
  try {
    json = await response.json() as Record<string, unknown>
  } catch (err) {
    logError('4_imagen_parse_failed', err, { jobId })
    await failJob(supabase, jobId, opts.plan.id, 'AI image generation returned unreadable data.', null)
    return { jobId, publicUrl: '', storagePath: '', altText: '', error: 'AI image generation returned unreadable data.' }
  }

  // ── Extract image data ────────────────────────────────────────────────────
  // The Imagen REST API returns:
  //   { predictions: [{ bytesBase64Encoded: "...", mimeType: "image/png" }] }
  const { b64, mimeType, extractError } = extractImageFromImagenResponse(json)

  log('5_image_data_extracted', {
    jobId,
    hasBytesBase64Encoded: !!b64,
    mimeType,
    extractError: extractError ?? null,
    predictionsCount: Array.isArray(json.predictions) ? json.predictions.length : 0,
  })

  if (extractError || !b64) {
    const errMsg = extractError
      ? 'AI image generation returned invalid image data.'
      : 'AI image generation returned no image data.'
    logError('5_no_image_data', new Error(errMsg), { jobId, planId: opts.plan.id, responseKeys: Object.keys(json) })
    await failJob(supabase, jobId, opts.plan.id, errMsg, null)
    return { jobId, publicUrl: '', storagePath: '', altText: '', error: errMsg }
  }

  // ── Decode and upload ─────────────────────────────────────────────────────
  const ext         = mimeType === 'image/jpeg' ? 'jpg' : 'png'
  const binaryData  = Buffer.from(b64, 'base64')
  const filename    = `${opts.plan.image_role}_${Date.now()}.${ext}`
  const storagePath = buildImageStoragePath(opts.tenantId, opts.plan.id, filename)

  log('6_storage_upload_starting', {
    jobId,
    bucket:      WEBSITE_IMAGE_BUCKET,
    storagePath,
    mimeType,
    sizeBytes:   binaryData.length,
    tenantId:    opts.tenantId,
    planId:      opts.plan.id,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  })

  const { error: uploadErr } = await supabase.storage
    .from(WEBSITE_IMAGE_BUCKET)
    .upload(storagePath, binaryData, { contentType: mimeType, upsert: true })

  if (uploadErr) {
    const isBucketError = uploadErr.message.toLowerCase().includes('bucket')
      || uploadErr.message.toLowerCase().includes('not found')
    const errMsg = isBucketError ? MISSING_BUCKET_MESSAGE : `Storage upload failed: ${uploadErr.message}`
    logError('6_storage_upload_failed', new Error(uploadErr.message), {
      jobId,
      bucket:    WEBSITE_IMAGE_BUCKET,
      storagePath,
      isBucketError,
    })
    await failJob(supabase, jobId, opts.plan.id, errMsg, uploadErr.message)
    return { jobId, publicUrl: '', storagePath: '', altText: '', error: errMsg }
  }

  log('7_storage_upload_success', { jobId, bucket: WEBSITE_IMAGE_BUCKET, storagePath })

  // ── Get public URL ────────────────────────────────────────────────────────
  const { data: urlData } = supabase.storage.from(WEBSITE_IMAGE_BUCKET).getPublicUrl(storagePath)
  const publicUrl         = urlData.publicUrl

  log('8_public_url_created', { jobId, publicUrl, storagePath })

  const altText = buildAltText(opts.plan)

  // ── Update job to completed ───────────────────────────────────────────────
  await supabase.from('website_image_jobs').update({
    status:              'completed',
    storage_path:        storagePath,
    public_url:          publicUrl,
    alt_text:            altText,
    generation_metadata: {
      model,
      finalPrompt,
      mimeType,
      bucket:      WEBSITE_IMAGE_BUCKET,
      storagePath,
      sizeBytes:   binaryData.length,
    } as never,
    updated_at: new Date().toISOString(),
  } as never).eq('id', jobId)

  log('9_job_completed', { jobId, publicUrl, storagePath })

  // ── Update plan to 'generated' ────────────────────────────────────────────
  await supabase.from('website_image_plans').update({
    status:                 'generated',
    generated_asset_url:    publicUrl,
    generated_storage_path: storagePath,
    generated_alt_text:     altText,
    public_url:             publicUrl,
    storage_path:           storagePath,
    alt_text:               altText,
    storage_bucket:         WEBSITE_IMAGE_BUCKET,
    job_id:                 jobId,
    generated_at:           new Date().toISOString(),
    error_message:          null,
    error_details:          null,
    updated_at:             new Date().toISOString(),
  } as never).eq('id', opts.plan.id)

  // ── Save into website_section_images gallery ─────────────────────────────
  // This makes every generated image available in the gallery picker.
  // We check if an active image already exists for this tenant+section+slot.
  const imageSlot = opts.plan.placement_key ?? 'primary'

  const db = supabase as unknown as {
    from: (t: 'website_section_images') => ReturnType<typeof supabase.from>
  }

  const { data: existingActive } = await db.from('website_section_images')
    .select('id')
    .eq('tenant_id', opts.tenantId)
    .eq('section_id', opts.plan.section_id ?? '')
    .eq('slot_key', imageSlot)
    .eq('is_active', true)
    .eq('is_archived', false)
    .maybeSingle()

  const shouldBeActive = !existingActive

  if (opts.plan.section_id) {
    const { error: galleryErr } = await db.from('website_section_images')
      .insert({
        tenant_id:      opts.tenantId,
        page_id:        opts.plan.page_id ?? null,
        section_id:     opts.plan.section_id,
        plan_id:        opts.plan.id,
        slot_key:       imageSlot,
        image_role:     opts.plan.image_role ?? null,
        section_type:   opts.plan.section_type ?? null,
        prompt:         finalPrompt,
        image_model:    model,
        aspect_ratio:   safeAspectRatio,
        storage_bucket: WEBSITE_IMAGE_BUCKET,
        storage_path:   storagePath,
        image_url:      publicUrl,
        public_url:     publicUrl,
        alt_text:       altText,
        is_active:      shouldBeActive,
        is_archived:    false,
        status:         'generated',
        provider:       'google-imagen',
        created_by:     opts.createdBy ?? null,
        metadata: {
          jobId,
          mimeType,
          sizeBytes: binaryData.length,
        },
      } as never)

    if (galleryErr) {
      // Non-fatal: log but don't fail the generation
      console.warn('[websiteImageGenerator] Failed to insert website_section_images row:', galleryErr.message)
    } else {
      log('11_gallery_saved', { planId: opts.plan.id, imageSlot, isActive: shouldBeActive })
    }
  }

  log('10_plan_updated', {
    planId:       opts.plan.id,
    status:       'generated',
    publicUrl,
    storagePath,
    tenantId:     opts.tenantId,
    sectionId:    opts.plan.section_id,
    placementKey: opts.plan.placement_key,
  })

  return { jobId, publicUrl, storagePath, altText, aspectRatio: safeAspectRatio }
}

// ── Response extraction ────────────────────────────────────────────────────────

/**
 * Extracts base64 image data from the Imagen API response.
 * Handles the standard predictions[].bytesBase64Encoded shape plus
 * potential alternative shapes for forward-compatibility.
 */
function extractImageFromImagenResponse(json: Record<string, unknown>): {
  b64?: string
  mimeType: string
  extractError?: string
} {
  const predictions = json.predictions as Array<Record<string, unknown>> | undefined

  if (!predictions || !Array.isArray(predictions) || predictions.length === 0) {
    // Try alternate top-level shape (some preview API versions)
    const topB64 = json.bytesBase64Encoded as string | undefined
    if (topB64) {
      return {
        b64:      topB64,
        mimeType: (json.mimeType as string | undefined) ?? 'image/png',
      }
    }
    return {
      mimeType:     'image/png',
      extractError: `Imagen returned no predictions. Response keys: ${Object.keys(json).join(', ')}`,
    }
  }

  const first = predictions[0]
  if (!first || typeof first !== 'object') {
    return {
      mimeType:     'image/png',
      extractError: 'Imagen predictions array contained no usable item.',
    }
  }

  // Standard shape: { bytesBase64Encoded, mimeType }
  const b64 = (
    first.bytesBase64Encoded
    ?? first.bytes_base64_encoded
    ?? first.imageBytes
    ?? first.image_bytes
  ) as string | undefined

  const mimeType = ((
    first.mimeType
    ?? first.mime_type
    ?? first.imageType
    ?? first.image_type
  ) as string | undefined) ?? 'image/png'

  if (!b64) {
    return {
      mimeType,
      extractError: `Imagen prediction had no image bytes. Prediction keys: ${Object.keys(first).join(', ')}`,
    }
  }

  return { b64, mimeType }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildAltText(plan: WebsiteImagePlan): string {
  if (plan.image_description) return plan.image_description.slice(0, 200)
  return `${plan.title ?? plan.image_role} for website ${plan.section_type ?? 'section'}`
}

async function failJob(
  supabase:    ReturnType<typeof getSupabaseServerClient>,
  jobId:       string,
  planId:      string | null,
  errMsg:      string,
  errDetails:  string | null,
): Promise<void> {
  await supabase.from('website_image_jobs').update({
    status:        'failed',
    error_message: errMsg,
    updated_at:    new Date().toISOString(),
  } as never).eq('id', jobId)

  if (planId) {
    await supabase.from('website_image_plans').update({
      status:        'failed',
      error_message: errMsg,
      error_details: errDetails ?? null,
      updated_at:    new Date().toISOString(),
    } as never).eq('id', planId)
  }

  log('fail_job', { jobId, planId, errMsg })
}
