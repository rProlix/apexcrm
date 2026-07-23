type SignedUrl = { url: string; expiresAt: number }

const signedUrlCache = new Map<string, SignedUrl>()
const pendingUrls = new Map<string, Promise<SignedUrl>>()
const MAX_ENTRIES = 1_000
const REFRESH_EARLY_MS = 30_000

export async function getCachedPrivateMediaSignedUrl({
  cacheKey,
  ttlSeconds,
  create,
  now = Date.now(),
}: {
  cacheKey: string
  ttlSeconds: number
  create: () => Promise<string>
  now?: number
}) {
  const cached = signedUrlCache.get(cacheKey)
  if (cached && cached.expiresAt - REFRESH_EARLY_MS > now) return cached
  const pending = pendingUrls.get(cacheKey)
  if (pending) return pending

  const request = create().then((url) => {
    const value = { url, expiresAt: now + ttlSeconds * 1_000 }
    signedUrlCache.set(cacheKey, value)
    while (signedUrlCache.size > MAX_ENTRIES) {
      const oldestKey = signedUrlCache.keys().next().value
      if (!oldestKey) break
      signedUrlCache.delete(oldestKey)
    }
    return value
  }).finally(() => {
    if (pendingUrls.get(cacheKey) === request) pendingUrls.delete(cacheKey)
  })
  pendingUrls.set(cacheKey, request)
  return request
}
