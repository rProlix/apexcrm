import {
  clearSignedPrivateMediaCache,
  getSignedPrivateMediaCacheSize,
  getSignedPrivateMediaUrl,
  invalidateSignedPrivateMediaUrl,
  type SignedPrivateMediaUrl,
} from '@/lib/private-media/url-cache'

export type SignedImageUrl = SignedPrivateMediaUrl
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

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
  return getSignedPrivateMediaUrl({
    cacheKey: cacheKey(imageId, businessId),
    endpoint: `/api/van-damage/images/${encodeURIComponent(imageId)}/signed-url?businessId=${encodeURIComponent(businessId)}`,
    forceRefresh,
    fetcher,
    now,
  })
}

export function invalidateSignedDamageImageUrl(imageId: string, businessId: string) {
  invalidateSignedPrivateMediaUrl(cacheKey(imageId, businessId))
}

export function clearSignedDamageImageCache() {
  clearSignedPrivateMediaCache()
}

export function getSignedDamageImageCacheSize() {
  return getSignedPrivateMediaCacheSize()
}
