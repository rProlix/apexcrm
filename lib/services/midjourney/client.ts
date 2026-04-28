// lib/services/midjourney/client.ts
// Midjourney API abstraction.
//
// Provider: ImagineAPI (https://www.imagineapi.dev) — a reliable REST wrapper
// around Midjourney that supports async job polling.
// Set IMAGINE_API_TOKEN in your environment.  If you swap to a different
// Midjourney proxy just replace this file; the spin-generator service only
// depends on the exported interface.

import type { MidjourneyJobResult } from '@/types/spin-packages'

const BASE_URL = 'https://cl.imagineapi.dev'

interface ImagineApiResponse {
  id:          string
  prompt:      string
  status:      'pending' | 'in-progress' | 'completed' | 'failed'
  upscaled_urls?: string[]
  url?:        string
  error?:      string
}

function getToken(): string {
  const token = process.env.IMAGINE_API_TOKEN
  if (!token) throw new Error('IMAGINE_API_TOKEN environment variable is not set')
  return token
}

/**
 * Submits a prompt to ImagineAPI and returns the job ID immediately.
 * The job is processed asynchronously — poll with `pollJob`.
 */
export async function submitPrompt(prompt: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/items/`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ prompt }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ImagineAPI submitPrompt failed (${res.status}): ${text}`)
  }

  const json: ImagineApiResponse = await res.json()
  return json.id
}

/**
 * Polls a job by ID until it reaches a terminal state (completed / failed).
 * Respects a configurable timeout in milliseconds (default 5 minutes).
 */
export async function pollJob(
  jobId:          string,
  timeoutMs:      number = 5 * 60 * 1000,
  intervalMs:     number = 6_000,
): Promise<MidjourneyJobResult> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await sleep(intervalMs)

    const res = await fetch(`${BASE_URL}/items/${jobId}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` },
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`ImagineAPI pollJob failed (${res.status}): ${text}`)
    }

    const job: ImagineApiResponse = await res.json()

    if (job.status === 'completed') {
      const imageUrl = job.upscaled_urls?.[0] ?? job.url ?? ''
      if (!imageUrl) throw new Error(`ImagineAPI job ${jobId} completed but returned no image URL`)
      return { job_id: jobId, image_url: imageUrl, status: 'completed' }
    }

    if (job.status === 'failed') {
      return { job_id: jobId, image_url: '', status: 'failed' }
    }
    // pending / in-progress → keep polling
  }

  throw new Error(`ImagineAPI job ${jobId} timed out after ${timeoutMs}ms`)
}

/**
 * One-shot helper: submit a prompt and wait for completion.
 * Suitable for sequential per-frame generation.
 */
export async function generateImage(
  prompt:    string,
  timeoutMs?: number,
): Promise<MidjourneyJobResult> {
  const jobId = await submitPrompt(prompt)
  return pollJob(jobId, timeoutMs)
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}
