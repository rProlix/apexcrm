import { VAN_DAMAGE_IMAGE_MIME_TYPES } from '../../../lib/van-damage/contracts.js'

export type SlackFileInfo = {
  id: string
  name: string
  mimetype: string
  size: number | null
  width: number | null
  height: number | null
  downloadUrl: string
}

type SlackFileResponse = {
  ok: boolean
  error?: string
  file?: {
    id?: string; name?: string; mimetype?: string; size?: number
    original_w?: number; original_h?: number
    url_private_download?: string; url_private?: string
  }
}

export function assertSlackClientInitialized() {
  if (typeof fetch !== 'function') throw new Error('Global fetch is unavailable')
  if (typeof AbortSignal.timeout !== 'function') throw new Error('AbortSignal.timeout is unavailable')
  return 'Slack Web API client ready'
}

async function fetchWithRateLimit(url: string | URL, init: RequestInit, attempts = 3): Promise<Response> {
  let response: Response | null = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    response = await fetch(url, init)
    if (response.status !== 429) return response
    const retryAfter = Math.min(Number(response.headers.get('retry-after') ?? '1'), 30)
    await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter, 1) * 1000))
  }
  return response!
}

export async function getSlackFileInfo(token: string, fileId: string): Promise<SlackFileInfo> {
  const url = new URL('https://slack.com/api/files.info')
  url.searchParams.set('file', fileId)
  const response = await fetchWithRateLimit(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Slack files.info HTTP ${response.status}`)
  const payload = await response.json() as SlackFileResponse
  const file = payload.file
  if (!payload.ok || !file?.id || !file.mimetype) throw new Error(`Slack files.info failed: ${payload.error ?? 'invalid_file'}`)
  if (!VAN_DAMAGE_IMAGE_MIME_TYPES.includes(file.mimetype as typeof VAN_DAMAGE_IMAGE_MIME_TYPES[number])) {
    throw new PermanentSlackFileError(`Slack file ${fileId} is not a supported image`)
  }
  const downloadUrl = file.url_private_download ?? file.url_private
  if (!downloadUrl) throw new Error(`Slack file ${fileId} has no private download URL`)
  return {
    id: file.id,
    name: file.name ?? file.id,
    mimetype: file.mimetype,
    size: file.size ?? null,
    width: file.original_w ?? null,
    height: file.original_h ?? null,
    downloadUrl,
  }
}

export async function downloadSlackImage(token: string, file: SlackFileInfo, maxBytes: number): Promise<Buffer> {
  if (file.size != null && file.size > maxBytes) throw new PermanentSlackFileError(`Image ${file.id} exceeds the configured size limit`)
  const response = await fetchWithRateLimit(file.downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Slack image download HTTP ${response.status}`)
  const declaredLength = Number(response.headers.get('content-length') ?? '0')
  if (declaredLength > maxBytes) throw new PermanentSlackFileError(`Image ${file.id} exceeds the configured size limit`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > maxBytes) throw new PermanentSlackFileError(`Image ${file.id} exceeds the configured size limit`)
  return buffer
}

export class PermanentSlackFileError extends Error {}
