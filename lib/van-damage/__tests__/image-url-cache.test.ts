import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  clearSignedDamageImageCache,
  getSignedDamageImageCacheSize,
  getSignedDamageImageUrl,
} from '../image-url-cache'

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

test('signed URL endpoint preserves authorization scope and private caching', async () => {
  const source = await readFile(new URL('../../../app/api/van-damage/images/[imageId]/signed-url/route.ts', import.meta.url), 'utf8')
  assert.match(source, /resolveVanDamageAccess/)
  assert.match(source, /\.eq\('tenant_id', access\.tenantId\)/)
  assert.match(source, /\.eq\('business_id', access\.businessId\)/)
  assert.match(source, /'Cache-Control': `private,/)
  assert.doesNotMatch(source, /Cache-Control': `public/)
})
