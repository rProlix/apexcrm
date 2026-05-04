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
import type { WebsiteImagePlan } from '@/lib/ai/websiteImageTypes'

const IMAGEN_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const TIMEOUT_MS      = 120_000

export interface GenerateImageOptions {
  plan:         WebsiteImagePlan
  tenantId:     string
  businessType: string | null
  createdBy?:   string | null
}

export interface GenerateImageResult {
  jobId:       string
  publicUrl:   string
  storagePath: string
  altText:     string
  error?:      string
}

export async function generateWebsiteImage(
  opts: GenerateImageOptions,
): Promise<GenerateImageResult> {
  const supabase = getSupabaseServerClient()
  const model    = getWebsiteImageModel()
  const apiKey   = process.env.GEMINI_API_KEY

  // Create the job record in 'generating' state
  const { data: job, error: jobErr } = await supabase
    .from('website_image_jobs')
    .insert({
      tenant_id:   opts.tenantId,
      plan_id:     opts.plan.id,
      status:      'generating',
      model,
      prompt:          opts.plan.prompt,
      negative_prompt: opts.plan.negative_prompt,
      aspect_ratio:    opts.plan.aspect_ratio,
      image_role:      opts.plan.image_role,
      placement_key:   opts.plan.placement_key,
      created_by:      opts.createdBy ?? null,
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    return { jobId: '', publicUrl: '', storagePath: '', altText: '', error: 'Failed to create image job record.' }
  }

  const jobId = job.id

  if (!apiKey) {
    await failJob(supabase, jobId, opts.plan.id, 'GEMINI_API_KEY is not set.')
    return { jobId, publicUrl: '', storagePath: '', altText: '', error: 'GEMINI_API_KEY is not set.' }
  }

  // Enhance the prompt for Imagen quality
  const finalPrompt = enhancePromptForImagen(
    opts.plan.prompt,
    opts.plan.image_role,
    opts.businessType,
  )
  const negativePrompt = opts.plan.negative_prompt ?? 'text, watermark, logo, blurry, distorted, ugly'

  const url  = `${IMAGEN_API_BASE}/${model}:predict?key=${apiKey}`
  const body = {
    instances: [{ prompt: finalPrompt }],
    parameters: {
      sampleCount:     1,
      aspectRatio:     opts.plan.aspect_ratio ?? '16:9',
      negativePrompt:  negativePrompt,
      personGeneration: 'dont_allow',
    },
  }

  let response: Response
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    })
  } catch (err: unknown) {
    clearTimeout(timer)
    const errMsg = err instanceof Error && err.name === 'AbortError'
      ? 'Image generation timed out. Try again.'
      : `Imagen request failed: ${err instanceof Error ? err.message : String(err)}`
    await failJob(supabase, jobId, opts.plan.id, errMsg)
    return { jobId, publicUrl: '', storagePath: '', altText: '', error: errMsg }
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    let errText = ''
    try { errText = await response.text() } catch { /* ignore */ }
    const errMsg = `Imagen API error ${response.status}: ${errText.slice(0, 300)}`
    await failJob(supabase, jobId, opts.plan.id, errMsg)
    return { jobId, publicUrl: '', storagePath: '', altText: '', error: errMsg }
  }

  let json: Record<string, unknown>
  try {
    json = await response.json() as Record<string, unknown>
  } catch {
    await failJob(supabase, jobId, opts.plan.id, 'Imagen returned unreadable data.')
    return { jobId, publicUrl: '', storagePath: '', altText: '', error: 'Imagen returned unreadable data.' }
  }

  const predictions = json.predictions as Array<Record<string, unknown>> | undefined
  if (!predictions?.length) {
    const errMsg = 'Imagen returned no predictions.'
    await failJob(supabase, jobId, opts.plan.id, errMsg)
    return { jobId, publicUrl: '', storagePath: '', altText: '', error: errMsg }
  }

  const first         = predictions[0]
  const b64           = first?.bytesBase64Encoded as string | undefined
  const mimeType      = (first?.mimeType as string | undefined) ?? 'image/png'

  if (!b64) {
    const errMsg = 'Imagen returned no image data.'
    await failJob(supabase, jobId, opts.plan.id, errMsg)
    return { jobId, publicUrl: '', storagePath: '', altText: '', error: errMsg }
  }

  // Decode base64 → Buffer
  const ext         = mimeType === 'image/jpeg' ? 'jpg' : 'png'
  const binaryData  = Buffer.from(b64, 'base64')
  const filename    = `${opts.plan.image_role}_${Date.now()}.${ext}`
  const storagePath = buildImageStoragePath(opts.tenantId, opts.plan.id, filename)

  // Upload to Supabase Storage
  const { error: uploadErr } = await supabase.storage
    .from(WEBSITE_IMAGE_BUCKET)
    .upload(storagePath, binaryData, { contentType: mimeType, upsert: true })

  if (uploadErr) {
    const errMsg = uploadErr.message.toLowerCase().includes('bucket')
      ? `Storage bucket "${WEBSITE_IMAGE_BUCKET}" is not configured. Create it in Supabase Storage → New bucket → "${WEBSITE_IMAGE_BUCKET}" (public).`
      : `Storage upload failed: ${uploadErr.message}`
    await failJob(supabase, jobId, opts.plan.id, errMsg)
    return { jobId, publicUrl: '', storagePath: '', altText: '', error: errMsg }
  }

  const { data: urlData } = supabase.storage.from(WEBSITE_IMAGE_BUCKET).getPublicUrl(storagePath)
  const publicUrl         = urlData.publicUrl

  // Build alt text from plan context
  const altText = buildAltText(opts.plan)

  // Update job to completed
  await supabase.from('website_image_jobs').update({
    status:              'completed',
    storage_path:        storagePath,
    public_url:          publicUrl,
    alt_text:            altText,
    generation_metadata: { model, finalPrompt, mimeType } as never,
    updated_at:          new Date().toISOString(),
  } as never).eq('id', jobId)

  // Update plan to 'generated'
  await supabase.from('website_image_plans').update({
    status:                 'generated',
    generated_asset_url:    publicUrl,
    generated_storage_path: storagePath,
    generated_alt_text:     altText,
    updated_at:             new Date().toISOString(),
  } as never).eq('id', opts.plan.id)

  return { jobId, publicUrl, storagePath, altText }
}

function buildAltText(plan: WebsiteImagePlan): string {
  if (plan.image_description) {
    return plan.image_description.slice(0, 200)
  }
  return `${plan.title ?? plan.image_role} for website ${plan.section_type ?? 'section'}`
}

async function failJob(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  jobId:    string,
  planId:   string | null,
  errMsg:   string,
): Promise<void> {
  await supabase.from('website_image_jobs').update({
    status:        'failed',
    error_message: errMsg,
    updated_at:    new Date().toISOString(),
  } as never).eq('id', jobId)

  if (planId) {
    await supabase.from('website_image_plans').update({
      status:     'planned',
      updated_at: new Date().toISOString(),
    } as never).eq('id', planId)
  }
}
