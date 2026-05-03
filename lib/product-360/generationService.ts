// lib/product-360/generationService.ts
// Orchestrates AI frame generation for a 360° package.
// Runs server-side only. Never import from client components.

import { getSupabaseServerClient }  from '@/lib/supabase/server'
import { buildFramePrompt, buildAngleSequence } from './generatePrompt'
import { getConfiguredProvider }    from './providers/imagineMidjourney'
import { fetchAndUploadFrame }      from './storage'

export interface GeneratePackageResult {
  success:          boolean
  framesGenerated:  number
  errorMessage?:    string
}

/**
 * Main generation pipeline. Called by the POST /generate API route.
 * Runs asynchronously — caller should fire-and-forget or await depending on context.
 */
export async function generatePackage(packageId: string): Promise<GeneratePackageResult> {
  const supabase = getSupabaseServerClient()

  // Load the package
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pkg, error: pkgErr } = await (supabase as any)
    .from('product_360_packages')
    .select('id, tenant_id, product_id, name, description, generation_prompt, negative_prompt, target_frame_count, generation_provider')
    .eq('id', packageId)
    .maybeSingle()

  if (pkgErr || !pkg) {
    return { success: false, framesGenerated: 0, errorMessage: 'Package not found' }
  }

  const tenantId   = pkg.tenant_id  as string
  const productId  = pkg.product_id as string | null
  const frameCount = (pkg.target_frame_count as number) || 36
  const prompt     = (pkg.generation_prompt as string) || ''
  const name       = (pkg.name as string) || 'Unnamed product'
  const description = (pkg.description as string) || ''

  if (!productId) {
    await markFailed(packageId, 'Package has no product attached.')
    return { success: false, framesGenerated: 0, errorMessage: 'No product attached' }
  }

  // Check provider
  const provider = getConfiguredProvider()
  if (!provider) {
    const msg = 'AI generation provider not configured. Set IMAGINE_API_TOKEN in environment variables.'
    await markFailed(packageId, msg)
    return { success: false, framesGenerated: 0, errorMessage: msg }
  }

  // Mark generating
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('product_360_packages')
    .update({ status: 'generating', generation_error: null, updated_at: new Date().toISOString() })
    .eq('id', packageId)

  // Create generation job record
  const jobPrompt = prompt || `${name}. ${description}`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobRow } = await (supabase as any)
    .from('product_360_generation_jobs')
    .insert({
      tenant_id:          tenantId,
      package_id:         packageId,
      product_id:         productId,
      provider:           provider.name,
      status:             'running',
      prompt:             jobPrompt,
      target_frame_count: frameCount,
      started_at:         new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()

  const jobId = (jobRow as { id: string } | null)?.id

  const angles = buildAngleSequence(frameCount)
  let framesGenerated = 0

  try {
    for (let i = 0; i < angles.length; i++) {
      const angle = angles[i]
      const framePrompt = buildFramePrompt({
        productName:        name,
        productDescription: description,
        angleDegrees:       angle,
      })

      const result = await provider.generate({ prompt: framePrompt })

      if (!result.imageUrl) {
        throw new Error(`Frame ${i} generation returned no image URL`)
      }

      // Upload to Supabase Storage
      const { imageUrl, storagePath } = await fetchAndUploadFrame({
        tenantId,
        productId,
        packageId,
        frameIndex: i,
        sourceUrl:  result.imageUrl,
      })

      // Insert frame record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('product_360_frames')
        .upsert({
          package_id:    packageId,
          tenant_id:     tenantId,
          product_id:    productId,
          frame_index:   i,
          angle_degrees: angle,
          image_url:     imageUrl,
          storage_path:  storagePath,
        }, { onConflict: 'package_id,frame_index' })

      framesGenerated++

      // Update job progress
      if (jobId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('product_360_generation_jobs')
          .update({ frames_completed: framesGenerated })
          .eq('id', jobId)
      }

      // Update cover from first frame
      if (i === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('product_360_packages')
          .update({ cover_frame_url: imageUrl })
          .eq('id', packageId)
      }
    }

    // Mark ready
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('product_360_packages')
      .update({
        status:      'ready',
        frame_count: framesGenerated,
        updated_at:  new Date().toISOString(),
      })
      .eq('id', packageId)

    if (jobId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('product_360_generation_jobs')
        .update({
          status:          'completed',
          frames_completed: framesGenerated,
          completed_at:    new Date().toISOString(),
        })
        .eq('id', jobId)
    }

    return { success: true, framesGenerated }

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown generation error'
    await markFailed(packageId, errorMessage)

    if (jobId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('product_360_generation_jobs')
        .update({
          status:        'failed',
          error_message: errorMessage,
          completed_at:  new Date().toISOString(),
        })
        .eq('id', jobId)
    }

    return { success: false, framesGenerated, errorMessage }
  }
}

async function markFailed(packageId: string, errorMessage: string): Promise<void> {
  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('product_360_packages')
    .update({ status: 'failed', generation_error: errorMessage, updated_at: new Date().toISOString() })
    .eq('id', packageId)
}
