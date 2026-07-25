import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  getOverlayTransformOrigin,
  MOTION_DURATION_MS,
  MOTION_EASING,
  MOTION_LAYER,
  MOTION_TRANSITION,
} from '@/lib/design-system/motion'

test('motion tokens keep routine feedback fast and overlays bounded', () => {
  assert.deepEqual(MOTION_DURATION_MS, {
    instant: 0,
    feedback: 120,
    state: 180,
    overlay: 240,
    layout: 280,
  })
  assert.deepEqual(MOTION_EASING.enter, [0.16, 1, 0.3, 1])
  assert.equal(MOTION_TRANSITION.overlay.duration, 0.24)
  assert.ok(MOTION_TRANSITION.layout.duration < 0.3)
})

test('motion layers preserve the overlay hierarchy', () => {
  assert.ok(MOTION_LAYER.sticky < MOTION_LAYER.drawer)
  assert.ok(MOTION_LAYER.drawer < MOTION_LAYER.modal)
  assert.ok(MOTION_LAYER.modal < MOTION_LAYER.toast)
})

test('overlay transform origin is derived from the invoking control', () => {
  assert.equal(
    getOverlayTransformOrigin({ left: 100, top: 40, width: 60, height: 32 }, { left: 80, top: 20 }),
    '50px 36px'
  )
})

test('reduced-motion CSS disables signature movement without destroying all transitions', async () => {
  const css = await readFile(path.join(process.cwd(), 'app/globals.css'), 'utf8')
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /\.ui-overlay-enter,[\s\S]*animation: none !important/)
  assert.doesNotMatch(css, /0\.01ms/)
  assert.doesNotMatch(css, /\*\s*\{[\s\S]*animation-duration:\s*0/)
})

test('shared motion utilities contain no infinite decorative loops', async () => {
  const files = await Promise.all([
    readFile(path.join(process.cwd(), 'lib/motion.ts'), 'utf8'),
    readFile(path.join(process.cwd(), 'lib/design-system/motion.ts'), 'utf8'),
    readFile(
      path.join(process.cwd(), 'components/command-center/OperationsRealtimeProvider.tsx'),
      'utf8'
    ),
  ])
  assert.doesNotMatch(
    files.join('\n'),
    /repeat\s*:\s*Infinity|animation-iteration-count\s*:\s*infinite/
  )
})
