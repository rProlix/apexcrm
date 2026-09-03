import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveDamageOverlayGeometry } from '../overlay-geometry'

test('overlay geometry accepts normalized, percent, and pixel boxes', () => {
  assert.deepEqual(
    resolveDamageOverlayGeometry({
      imageId: 'image-1',
      findingImageId: 'image-1',
      box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      imageWidth: 1000,
      imageHeight: 500,
    }),
    { ok: true, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, source: 'normalized' }
  )
  assert.deepEqual(
    resolveDamageOverlayGeometry({
      imageId: 'image-1',
      box: { x: 10, y: 20, width: 30, height: 40 },
      imageWidth: 1000,
      imageHeight: 500,
    }),
    { ok: true, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, source: 'percent' }
  )
  assert.deepEqual(
    resolveDamageOverlayGeometry({
      imageId: 'image-1',
      box: { x: 100, y: 50, width: 250, height: 100 },
      imageWidth: 1000,
      imageHeight: 500,
    }),
    { ok: true, box: { x: 0.1, y: 0.1, width: 0.25, height: 0.2 }, source: 'pixel' }
  )
})

test('overlay geometry handles EXIF rotation and rejects unsafe boxes', () => {
  assert.deepEqual(
    resolveDamageOverlayGeometry({
      imageId: 'image-1',
      box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      orientation: 6,
    }),
    { ok: true, box: { x: 0.4, y: 0.1, width: 0.4, height: 0.3 }, source: 'normalized' }
  )
  assert.equal(
    failureReason(
      resolveDamageOverlayGeometry({
        imageId: 'image-1',
        findingImageId: 'other-image',
        box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      })
    ),
    'wrong_image'
  )
  assert.equal(
    failureReason(
      resolveDamageOverlayGeometry({
        imageId: 'image-1',
        box: { x: -0.1, y: 0.1, width: 0.2, height: 0.2 },
      })
    ),
    'outside_image'
  )
  assert.equal(
    failureReason(
      resolveDamageOverlayGeometry({
        imageId: 'image-1',
        box: { x: 0, y: 0, width: 1, height: 1 },
      })
    ),
    'too_large'
  )
})

function failureReason(result: ReturnType<typeof resolveDamageOverlayGeometry>) {
  assert.equal(result.ok, false)
  return result.reason
}
