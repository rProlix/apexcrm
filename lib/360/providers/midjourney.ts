// lib/360/providers/midjourney.ts
// Midjourney provider for the product_360_spin module.
//
// Uses the ImagineAPI (https://imagineapi.dev) REST proxy for Midjourney.
// Required environment variables:
//   IMAGINE_API_TOKEN   — ImagineAPI bearer token
//   IMAGINE_API_URL     — optional override (default: https://cl.imagineapi.dev)
//
// If the environment variables are not set, all calls throw with a clear message.
// NEVER import this file from a client component.

const DEFAULT_BASE_URL = 'https://cl.imagineapi.dev'

function getBaseUrl(): string {
  return process.env.IMAGINE_API_URL?.trim() || DEFAULT_BASE_URL
}

function getToken(): string {
  const token = process.env.IMAGINE_API_TOKEN?.trim()
  if (!token) {
    throw new Error(
      'Midjourney provider is not configured. ' +
      'Set IMAGINE_API_TOKEN in your environment variables.'
    )
  }
  return token
}

interface ImagineApiResponse {
  id:             string
  prompt:         string
  status:         'pending' | 'in-progress' | 'completed' | 'failed'
  upscaled_urls?: string[]
  url?:           string
  error?:         string
}

export interface MidjourneyGenerateResult {
  imageUrl: string
  jobId:    string
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Submits a prompt to ImagineAPI. Returns the job ID.
 */
export async function submitMidjourneyPrompt(prompt: string): Promise<string> {
  const res = await fetch(`${getBaseUrl()}/items/`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ prompt }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ImagineAPI submit failed (${res.status}): ${text}`)
  }

  const json: ImagineApiResponse = await res.json()
  return json.id
}

/**
 * Polls a job until it reaches a terminal state (completed / failed).
 */
export async function pollMidjourneyJob(
  jobId:      string,
  timeoutMs:  number = 5 * 60 * 1000,
  intervalMs: number = 6_000,
): Promise<MidjourneyGenerateResult> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await sleep(intervalMs)

    const res = await fetch(`${getBaseUrl()}/items/${jobId}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` },
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`ImagineAPI poll failed (${res.status}): ${text}`)
    }

    const job: ImagineApiResponse = await res.json()

    if (job.status === 'completed') {
      const imageUrl = job.upscaled_urls?.[0] ?? job.url ?? ''
      if (!imageUrl) throw new Error(`Job ${jobId} completed but returned no image URL`)
      return { imageUrl, jobId }
    }

    if (job.status === 'failed') {
      throw new Error(`ImagineAPI job ${jobId} failed`)
    }
    // pending / in-progress → keep polling
  }

  throw new Error(`ImagineAPI job ${jobId} timed out after ${timeoutMs}ms`)
}

/**
 * One-shot: submit and wait for a single image.
 */
export async function generateImageForAngle(params: {
  prompt:    string
  timeoutMs?: number
}): Promise<MidjourneyGenerateResult> {
  const jobId = await submitMidjourneyPrompt(params.prompt)
  return pollMidjourneyJob(jobId, params.timeoutMs)
}
