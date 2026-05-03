// lib/product-360/providers/imagineMidjourney.ts
// ImagineAPI / Midjourney provider for 360° frame generation.
//
// Required env vars:
//   IMAGINE_API_TOKEN   — ImagineAPI bearer token
//   IMAGINE_API_URL     — optional override (default: https://cl.imagineapi.dev)
//
// SERVER-ONLY. Never import from client components.

import type { P360Provider, GenerateImageParams, GenerateImageResult } from './types'

const DEFAULT_BASE_URL = 'https://cl.imagineapi.dev'

function getBaseUrl(): string {
  return process.env.IMAGINE_API_URL?.trim() || DEFAULT_BASE_URL
}

function getToken(): string {
  const token = process.env.IMAGINE_API_TOKEN?.trim()
    || process.env.MIDJOURNEY_API_TOKEN?.trim()
  if (!token) {
    throw new Error(
      'Midjourney/ImagineAPI is not configured. ' +
      'Set IMAGINE_API_TOKEN in your environment variables.',
    )
  }
  return token
}

interface ImagineApiJob {
  id:              string
  status:          'pending' | 'in-progress' | 'completed' | 'failed'
  upscaled_urls?:  string[]
  url?:            string
  error?:          string
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function submitPrompt(prompt: string): Promise<string> {
  const res = await fetch(`${getBaseUrl()}/items/`, {
    method:  'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  })
  if (!res.ok) {
    throw new Error(`ImagineAPI submit failed (${res.status}): ${await res.text()}`)
  }
  const json = (await res.json()) as ImagineApiJob
  return json.id
}

async function pollJob(
  jobId:      string,
  timeoutMs:  number,
  intervalMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await sleep(intervalMs)
    const res = await fetch(`${getBaseUrl()}/items/${jobId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    if (!res.ok) {
      throw new Error(`ImagineAPI poll failed (${res.status}): ${await res.text()}`)
    }
    const job = (await res.json()) as ImagineApiJob

    if (job.status === 'completed') {
      const url = job.upscaled_urls?.[0] ?? job.url ?? ''
      if (!url) throw new Error(`Job ${jobId} completed but returned no image URL`)
      return url
    }
    if (job.status === 'failed') {
      throw new Error(`ImagineAPI job ${jobId} failed: ${job.error ?? 'unknown error'}`)
    }
  }
  throw new Error(`ImagineAPI job ${jobId} timed out after ${timeoutMs}ms`)
}

export const imagineMidjourneyProvider: P360Provider = {
  name: 'imagine_midjourney',

  isAvailable() {
    return !!(
      process.env.IMAGINE_API_TOKEN?.trim() ||
      process.env.MIDJOURNEY_API_TOKEN?.trim()
    )
  },

  async generate(params: GenerateImageParams): Promise<GenerateImageResult> {
    const { prompt, timeoutMs = 5 * 60 * 1000 } = params
    const jobId   = await submitPrompt(prompt)
    const imageUrl = await pollJob(jobId, timeoutMs, 8_000)
    return { imageUrl, jobId, provider: 'imagine_midjourney' }
  },
}

/** Get a configured provider, or null if not available. */
export function getConfiguredProvider(): P360Provider | null {
  if (imagineMidjourneyProvider.isAvailable()) return imagineMidjourneyProvider
  return null
}
