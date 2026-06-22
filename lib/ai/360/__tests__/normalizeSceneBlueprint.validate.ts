// lib/ai/360/__tests__/normalizeSceneBlueprint.validate.ts
//
// Validation script for normalizeSceneBlueprint.
// Run with: npx ts-node --project tsconfig.json lib/ai/360/__tests__/normalizeSceneBlueprint.validate.ts
// Or in a test environment: npx tsx lib/ai/360/__tests__/normalizeSceneBlueprint.validate.ts

import { normalizeSceneBlueprint } from '../buildLockedFramePrompt'
import { normalizeProductSubject }  from '../normalizeProduct'
import type { P360GenerationConfig } from '../types'

const baseConfig: P360GenerationConfig = {
  frameCount:          12,
  lightingPreset:      'softbox_studio',
  backgroundPreset:    'warm_beige',
  categoryPreset:      'food_bowl',
  cameraPreset:        null,
  cameraDistance:      null,
  cameraHeight:        null,
  fov:                 null,
  shadowStrength:      null,
  reflectionIntensity: null,
  turnDirection:       'clockwise',
  outputWidth:         1024,
  outputHeight:        1024,
  generationNotes:     null,
  customPrompt:        null,
}

const foodSubject  = normalizeProductSubject('Beef Pho', 'Soup noodles in a bowl', 'food_bowl')
const drinkSubject = normalizeProductSubject('Green Tea Latte', 'Hot drink in a cup', 'beverage')
const genSubject   = normalizeProductSubject('Product', '', null)

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`)
    passed++
  } else {
    console.error(`  ✗ ${msg}`)
    failed++
  }
}

// ── Test 1: undefined blueprint ──────────────────────────────────────────────
console.log('\nTest 1: undefined blueprint does not crash')
const t1 = normalizeSceneBlueprint(undefined, foodSubject, baseConfig)
assert(typeof t1 === 'object', 'returns an object')
assert(typeof t1.subject.vessel === 'string' && t1.subject.vessel.length > 0, `vessel is non-empty: "${t1.subject.vessel}"`)

// ── Test 2: null blueprint ────────────────────────────────────────────────────
console.log('\nTest 2: null blueprint does not crash')
const t2 = normalizeSceneBlueprint(null, foodSubject, baseConfig)
assert(typeof t2 === 'object', 'returns an object')
assert(t2.subject.vessel.length > 0, `vessel: "${t2.subject.vessel}"`)

// ── Test 3: malformed blueprint (random string) ───────────────────────────────
console.log('\nTest 3: malformed blueprint (random string)')
const t3 = normalizeSceneBlueprint('not-json-{{{', foodSubject, baseConfig)
assert(typeof t3 === 'object', 'returns an object')
assert(t3.subject.vessel.length > 0, `vessel: "${t3.subject.vessel}"`)

// ── Test 4: blueprint missing subject ─────────────────────────────────────────
console.log('\nTest 4: blueprint missing subject field')
const t4 = normalizeSceneBlueprint({ camera: { heightAngle: '15°' } }, foodSubject, baseConfig)
assert(typeof t4.subject === 'object', 'subject is an object')
assert(t4.subject.vessel.length > 0, `vessel from defaults: "${t4.subject.vessel}"`)
assert(t4.camera.heightAngle === '15°', 'existing camera.heightAngle preserved')

// ── Test 5: blueprint has subject but missing vessel ──────────────────────────
console.log('\nTest 5: blueprint has subject but missing vessel')
const t5 = normalizeSceneBlueprint({ subject: { name: 'Ramen' } }, foodSubject, baseConfig)
assert(t5.subject.name === 'Ramen', `name preserved: "${t5.subject.name}"`)
assert(t5.subject.vessel.length > 0, `vessel filled from defaults: "${t5.subject.vessel}"`)

// ── Test 6: food product gets bowl vessel by default ─────────────────────────
console.log('\nTest 6: food (bowl) product gets bowl vessel')
const t6 = normalizeSceneBlueprint(null, foodSubject, baseConfig)
assert(t6.subject.vessel.toLowerCase().includes('bowl'), `food gets bowl vessel: "${t6.subject.vessel}"`)

// ── Test 7: drink product gets cup/glass vessel ───────────────────────────────
console.log('\nTest 7: drink product gets cup/glass vessel')
const t7 = normalizeSceneBlueprint(null, drinkSubject, { ...baseConfig, categoryPreset: 'beverage' })
assert(
  t7.subject.vessel.toLowerCase().includes('cup') || t7.subject.vessel.toLowerCase().includes('glass'),
  `drink gets cup/glass vessel: "${t7.subject.vessel}"`,
)

// ── Test 8: existing vessel is preserved ─────────────────────────────────────
console.log('\nTest 8: existing vessel value is preserved')
const t8 = normalizeSceneBlueprint({
  subject: { vessel: 'handmade ceramic ramen bowl' },
}, foodSubject, baseConfig)
assert(t8.subject.vessel === 'handmade ceramic ramen bowl', `custom vessel preserved: "${t8.subject.vessel}"`)

// ── Test 9: generic (non-food, non-drink) product gets container vessel ───────
console.log('\nTest 9: generic product gets container/packaging vessel')
const t9 = normalizeSceneBlueprint(null, genSubject, { ...baseConfig, categoryPreset: null })
assert(t9.subject.vessel.length > 0, `generic product has a vessel: "${t9.subject.vessel}"`)

// ── Test 10: empty object blueprint ──────────────────────────────────────────
console.log('\nTest 10: empty object blueprint {} fills all defaults')
const t10 = normalizeSceneBlueprint({}, foodSubject, baseConfig)
assert(typeof t10.consistencyRules === 'object' && Array.isArray(t10.consistencyRules), 'consistencyRules is array')
assert(typeof t10.lighting.style === 'string' && t10.lighting.style.length > 0, `lighting.style: "${t10.lighting.style}"`)
assert(typeof t10.background.style === 'string', `background.style: "${t10.background.style}"`)
assert(t10.camera.orbitMode === 'turntable_orbit', 'orbitMode is turntable_orbit')

// ── Test 11: stringified JSON blueprint ──────────────────────────────────────
console.log('\nTest 11: stringified JSON blueprint parses and merges')
const t11 = normalizeSceneBlueprint(
  JSON.stringify({ subject: { vessel: 'tall wine glass', name: 'Bordeaux Wine' } }),
  genSubject,
  baseConfig,
)
assert(t11.subject.vessel === 'tall wine glass', `parsed vessel: "${t11.subject.vessel}"`)
assert(t11.subject.name === 'Bordeaux Wine', `parsed name: "${t11.subject.name}"`)

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.error('VALIDATION FAILED')
  process.exit(1)
} else {
  console.log('All validations passed ✓')
}
