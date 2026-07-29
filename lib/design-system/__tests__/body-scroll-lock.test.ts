import assert from 'node:assert/strict'
import test from 'node:test'
import { createBodyScrollLockManager } from '@/lib/design-system/body-scroll-lock'

function createTarget(overflow = '', paddingRight = '') {
  return {
    body: { style: { overflow, paddingRight } },
    documentElement: { clientWidth: 1184 },
    viewportWidth: 1200,
  }
}

test('overlapping overlays keep the body locked until the final overlay closes', () => {
  const target = createTarget()
  const manager = createBodyScrollLockManager(() => target)

  const releaseFirst = manager.acquire()
  const releaseSecond = manager.acquire()
  assert.equal(target.body.style.overflow, 'hidden')
  assert.equal(manager.activeCount, 2)

  releaseFirst()
  assert.equal(target.body.style.overflow, 'hidden')
  assert.equal(manager.activeCount, 1)

  releaseSecond()
  assert.equal(target.body.style.overflow, '')
  assert.equal(target.body.style.paddingRight, '')
  assert.equal(manager.activeCount, 0)
})

test('scroll lock restores pre-existing body styles and ignores duplicate releases', () => {
  const target = createTarget('clip', '4px')
  const manager = createBodyScrollLockManager(() => target)

  const release = manager.acquire()
  assert.equal(target.body.style.paddingRight, '16px')
  release()
  release()

  assert.equal(target.body.style.overflow, 'clip')
  assert.equal(target.body.style.paddingRight, '4px')
  assert.equal(manager.activeCount, 0)
})
