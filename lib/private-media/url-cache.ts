export type SignedPrivateMediaUrl = {
  url: string
  expiresAt: number
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const urlCache = new Map<string, SignedPrivateMediaUrl>()
const pendingRequests = new Map<string, Promise<SignedPrivateMediaUrl>>()
const REFRESH_EARLY_MS = 15_000

export async function getSignedPrivateMediaUrl({
  cacheKey,
  endpoint,
  forceRefresh = false,
  fetcher = fetch,
  now = Date.now(),
}: {
  cacheKey: string
  endpoint: string
  forceRefresh?: boolean
  fetcher?: FetchLike
  now?: number
}): Promise<SignedPrivateMediaUrl> {
  const cached = urlCache.get(cacheKey)
  if (!forceRefresh && cached && cached.expiresAt - REFRESH_EARLY_MS > now) return cached

  if (!forceRefresh) {
    const pending = pendingRequests.get(cacheKey)
    if (pending) return pending
  }

  const request = fetcher(endpoint, {
    credentials: 'same-origin',
    cache: forceRefresh ? 'reload' : 'default',
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(response.status === 409 ? 'Media is still processing' : 'Media unavailable')
    }
    const result = await response.json() as {
      url?: string
      expiresAt?: string
      expiresIn?: number
    }
    if (!result.url) throw new Error('Media URL missing')
    const expiresAt = result.expiresAt
      ? Date.parse(result.expiresAt)
      : now + Math.max(1, result.expiresIn ?? 60) * 1000
    const value = {
      url: result.url,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : now + 45_000,
    }
    urlCache.set(cacheKey, value)
    return value
  }).finally(() => {
    if (pendingRequests.get(cacheKey) === request) pendingRequests.delete(cacheKey)
  })

  pendingRequests.set(cacheKey, request)
  return request
}

export function invalidateSignedPrivateMediaUrl(cacheKey: string) {
  urlCache.delete(cacheKey)
}

export function clearSignedPrivateMediaCache() {
  urlCache.clear()
  pendingRequests.clear()
}

export function getSignedPrivateMediaCacheSize() {
  return urlCache.size
}
