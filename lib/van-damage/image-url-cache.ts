export type SignedImageUrl = {
  url: string
  expiresAt: number
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const urlCache = new Map<string, SignedImageUrl>()
const pendingRequests = new Map<string, Promise<SignedImageUrl>>()
const REFRESH_EARLY_MS = 15_000

function cacheKey(imageId: string, businessId: string) {
  return `${businessId}:${imageId}`
}

export async function getSignedDamageImageUrl({
  imageId,
  businessId,
  forceRefresh = false,
  fetcher = fetch,
  now = Date.now(),
}: {
  imageId: string
  businessId: string
  forceRefresh?: boolean
  fetcher?: FetchLike
  now?: number
}): Promise<SignedImageUrl> {
  const key = cacheKey(imageId, businessId)
  const cached = urlCache.get(key)
  if (!forceRefresh && cached && cached.expiresAt - REFRESH_EARLY_MS > now) return cached

  if (!forceRefresh) {
    const pending = pendingRequests.get(key)
    if (pending) return pending
  }

  const request = fetcher(
    `/api/van-damage/images/${encodeURIComponent(imageId)}/signed-url?businessId=${encodeURIComponent(businessId)}`,
    { credentials: 'same-origin', cache: forceRefresh ? 'reload' : 'default' },
  ).then(async (response) => {
    if (!response.ok) throw new Error(response.status === 409 ? 'Image is still processing' : 'Image unavailable')
    const result = await response.json() as { url?: string; expiresAt?: string; expiresIn?: number }
    if (!result.url) throw new Error('Image URL missing')
    const expiresAt = result.expiresAt
      ? Date.parse(result.expiresAt)
      : now + Math.max(1, result.expiresIn ?? 60) * 1000
    const value = { url: result.url, expiresAt: Number.isFinite(expiresAt) ? expiresAt : now + 45_000 }
    urlCache.set(key, value)
    return value
  }).finally(() => {
    if (pendingRequests.get(key) === request) pendingRequests.delete(key)
  })

  pendingRequests.set(key, request)
  return request
}

export function invalidateSignedDamageImageUrl(imageId: string, businessId: string) {
  urlCache.delete(cacheKey(imageId, businessId))
}

export function clearSignedDamageImageCache() {
  urlCache.clear()
  pendingRequests.clear()
}

export function getSignedDamageImageCacheSize() {
  return urlCache.size
}
