import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  clearSignedDamageImageCache,
  getSignedDamageImageCacheSize,
  getSignedDamageImageUrl,
} from '../image-url-cache'
import { getSignedPrivateMediaUrl } from '@/lib/private-media/url-cache'

function response(url: string, expiresIn = 900) {
  return new Response(JSON.stringify({ url, expiresIn }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

test.beforeEach(clearSignedDamageImageCache)

test('cached signed image URLs are reused without duplicate downloads', async () => {
  let requests = 0
  const fetcher = async () => {
    requests += 1
    return response('https://private-s3.example/image?signature=one')
  }
  const first = await getSignedDamageImageUrl({ imageId: 'image-1', businessId: 'tenant-1', fetcher, now: 1_000 })
  const second = await getSignedDamageImageUrl({ imageId: 'image-1', businessId: 'tenant-1', fetcher, now: 2_000 })
  assert.equal(first.url, second.url)
  assert.equal(requests, 1)
  assert.equal(getSignedDamageImageCacheSize(), 1)
})

test('concurrent image consumers share one in-flight signed URL request', async () => {
  let requests = 0
  const fetcher = async () => {
    requests += 1
    await new Promise((resolve) => setTimeout(resolve, 5))
    return response('https://private-s3.example/image?signature=shared')
  }
  const [first, second] = await Promise.all([
    getSignedDamageImageUrl({ imageId: 'image-1', businessId: 'tenant-1', fetcher, now: 1_000 }),
    getSignedDamageImageUrl({ imageId: 'image-1', businessId: 'tenant-1', fetcher, now: 1_000 }),
  ])
  assert.equal(first.url, second.url)
  assert.equal(requests, 1)
})

test('a stalled signed URL request times out instead of leaving images loading forever', async () => {
  const stalledFetcher = () => new Promise<Response>(() => undefined)
  await assert.rejects(
    getSignedPrivateMediaUrl({
      cacheKey: 'tenant-1:stalled-image:thumbnail',
      endpoint: '/api/private-media/stalled',
      fetcher: stalledFetcher,
      requestTimeoutMs: 5,
    }),
    /timed out/,
  )
})

test('expired signed URLs refresh shortly before expiry', async () => {
  let requests = 0
  const fetcher = async () => response(`https://private-s3.example/image?signature=${++requests}`, 30)
  const first = await getSignedDamageImageUrl({ imageId: 'image-1', businessId: 'tenant-1', fetcher, now: 1_000 })
  const refreshed = await getSignedDamageImageUrl({ imageId: 'image-1', businessId: 'tenant-1', fetcher, now: 17_000 })
  assert.notEqual(first.url, refreshed.url)
  assert.equal(requests, 2)
})

test('signed URL cache keys preserve tenant isolation', async () => {
  let requests = 0
  const fetcher = async () => response(`https://private-s3.example/image?signature=${++requests}`)
  const tenantOne = await getSignedDamageImageUrl({ imageId: 'same-image', businessId: 'tenant-1', fetcher, now: 1_000 })
  const tenantTwo = await getSignedDamageImageUrl({ imageId: 'same-image', businessId: 'tenant-2', fetcher, now: 1_000 })
  assert.notEqual(tenantOne.url, tenantTwo.url)
  assert.equal(requests, 2)
})

test('signed URL cache keys preserve derivative profile isolation', async () => {
  let requests = 0
  const fetcher = async (input: RequestInfo | URL) => {
    requests += 1
    assert.match(String(input), /profile=(thumbnail|large)/)
    return response(`https://private-s3.example/image?signature=${requests}`)
  }
  const thumbnail = await getSignedDamageImageUrl({
    imageId: 'same-image',
    businessId: 'tenant-1',
    profile: 'thumbnail',
    fetcher,
    now: 1_000,
  })
  const large = await getSignedDamageImageUrl({
    imageId: 'same-image',
    businessId: 'tenant-1',
    profile: 'large',
    fetcher,
    now: 1_000,
  })
  assert.notEqual(thumbnail.url, large.url)
  assert.equal(requests, 2)
  assert.equal(getSignedDamageImageCacheSize(), 2)
})

test('signed URL endpoint preserves authorization scope and private caching', async () => {
  const source = await readFile(new URL('../../../app/api/van-damage/images/[imageId]/signed-url/route.ts', import.meta.url), 'utf8')
  assert.match(source, /resolveVanDamageAccess/)
  assert.match(source, /\.eq\('tenant_id', access\.tenantId\)/)
  assert.match(source, /\.eq\('business_id', access\.businessId\)/)
  assert.match(source, /profile/)
  assert.match(source, /van_damage_image_assets/)
  assert.match(source, /asset_type', 'original'/)
  assert.match(source, /PGRST205/)
  assert.match(source, /isMissingImageAssetsTable\(derivativeError\)/)
  assert.match(source, /isMissingImageAssetsTable\(originalAssetError\)/)
  assert.match(source, /Image has not been uploaded yet/)
  assert.match(source, /'Cache-Control': `private,/)
  assert.doesNotMatch(source, /Cache-Control': `public/)
})

test('fleet and inspection cards request small derivatives and bypass duplicate optimization', async () => {
  const [signedImage, gallery, fleet, profile, overlay, backfill, worker] =
    await Promise.all([
      readFile(
        new URL(
          '../../../components/van-damage/SignedDamageImage.tsx',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../../../components/van-damage/DamageImageGallery.tsx',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../../../components/van-damage/FleetNeedsAttentionBoard.tsx',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../../../components/van-damage/VanProfileWorkspace.tsx',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../../../components/van-damage/DamageOverlayFrame.tsx',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../../../workers/van-damage-worker/scripts/backfill-image-derivatives.ts',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../../../workers/van-damage-worker/src/process-job.ts',
          import.meta.url,
        ),
        'utf8',
      ),
    ])
  assert.match(signedImage, /unoptimized/)
  assert.match(signedImage, /decoding="async"/)
  assert.match(gallery, /profile="thumbnail"/)
  assert.match(fleet, /profile="thumbnail"/)
  assert.match(profile, /profile="thumbnail"/)
  assert.match(overlay, /IntersectionObserver/)
  assert.match(overlay, /enabled: nearViewport/)
  assert.match(backfill, /uploadDerivatives/)
  assert.match(backfill, /--execute/)
  assert.match(
    worker,
    /if \(duplicate\)[\s\S]*?} else {[\s\S]*?Every logical image gets its own display derivatives[\s\S]*?uploadDerivatives/,
  )
})
