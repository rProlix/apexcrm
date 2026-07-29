import {
  clearSignedPrivateMediaCache,
  getSignedPrivateMediaCacheSize,
  getSignedPrivateMediaUrl,
  invalidateSignedPrivateMediaUrl,
  type SignedPrivateMediaUrl,
} from '@/lib/private-media/url-cache'

export type SignedImageUrl = SignedPrivateMediaUrl
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type SignedDamageImageProfile = 'thumbnail' | 'medium' | 'large' | 'original'

function cacheKey(imageId: string, businessId: string, profile: SignedDamageImageProfile) {
  return `${businessId}:${imageId}:${profile}`
}

export async function getSignedDamageImageUrl({
  imageId,
  businessId,
  profile = 'medium',
  forceRefresh = false,
  fetcher = fetch,
  now = Date.now(),
}: {
  imageId: string
  businessId: string
  profile?: SignedDamageImageProfile
  forceRefresh?: boolean
  fetcher?: FetchLike
  now?: number
}): Promise<SignedImageUrl> {
  return getSignedPrivateMediaUrl({
    cacheKey: cacheKey(imageId, businessId, profile),
    endpoint: `/api/van-damage/images/${encodeURIComponent(imageId)}/signed-url?businessId=${encodeURIComponent(businessId)}&profile=${encodeURIComponent(profile)}`,
    forceRefresh,
    fetcher,
    now,
  })
}

export function invalidateSignedDamageImageUrl(imageId: string, businessId: string) {
  for (const profile of ['thumbnail', 'medium', 'large', 'original'] as SignedDamageImageProfile[]) {
    invalidateSignedPrivateMediaUrl(cacheKey(imageId, businessId, profile))
  }
}

export function clearSignedDamageImageCache() {
  clearSignedPrivateMediaCache()
}

export function getSignedDamageImageCacheSize() {
  return getSignedPrivateMediaCacheSize()
}
