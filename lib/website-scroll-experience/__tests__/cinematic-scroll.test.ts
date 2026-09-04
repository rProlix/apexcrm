import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { cinematicConfigSchema, normalizeCinematicConfig } from '@/lib/website-cinematic/schema'
import { CINEMATIC_PRESETS, getCinematicPreset } from '@/lib/website-cinematic/presets'
import {
  mapProgressToClip,
  orderCinematicClips,
  resolveCinematicLayer,
  selectCinematicSource,
} from '@/lib/website-cinematic/runtime'
import { validateCinematicConfigs } from '@/lib/website-cinematic/publishing'

test('all cinematic presets are versioned, editable configurations', () => {
  assert.equal(CINEMATIC_PRESETS.length, 14)
  for (const preset of CINEMATIC_PRESETS)
    assert.equal(cinematicConfigSchema.safeParse(preset).success, true, preset.name)
  assert.deepEqual(
    new Set(CINEMATIC_PRESETS.map((preset) => preset.engine)),
    new Set(['layers', 'video', 'hybrid'])
  )
})

test('configuration rejects invalid progress, missing targets, and executable asset URLs', () => {
  const preset = structuredClone(getCinematicPreset('Product Reveal'))
  preset.tracks[0].startProgress = 0.9
  preset.tracks[0].endProgress = 0.1
  assert.equal(cinematicConfigSchema.safeParse(preset).success, false)

  const missing = structuredClone(getCinematicPreset('Product Reveal'))
  missing.tracks[0].layerId = 'not-a-layer'
  assert.equal(cinematicConfigSchema.safeParse(missing).success, false)

  const unsafe = structuredClone(getCinematicPreset('Product Reveal'))
  unsafe.layers[0].type = 'image'
  unsafe.layers[0].src = 'javascript:alert(1)'
  assert.equal(normalizeCinematicConfig(unsafe), null)
})

test('weighted video chains select mobile sources and map continuous progress', () => {
  const clips = [
    {
      id: 'one',
      desktopSrc: '/one.mp4',
      mobileSrc: '/one-mobile.mp4',
      duration: 4,
      scrollWeight: 1,
      seamOverlap: 0.01,
    },
    { id: 'two', desktopSrc: '/two.mp4', duration: 8, scrollWeight: 3, seamOverlap: 0.02 },
  ]
  assert.equal(selectCinematicSource(clips[0], true), '/one-mobile.mp4')
  assert.equal(mapProgressToClip(clips, 0.125)?.localProgress, 0.5)
  assert.equal(mapProgressToClip(clips, 0.5)?.index, 1)
  assert.ok((mapProgressToClip(clips, 0.5)?.localProgress ?? 0) > 0)
})

test('clips are stable by order and mobile overrides inherit from larger breakpoints', () => {
  const config = getCinematicPreset('Product Reveal')
  const original = config.layers[0]
  const responsive = {
    ...original,
    responsive: { desktop: { width: 60 }, tablet: { x: 40 }, mobile: { x: 20 } },
  }
  assert.deepEqual(
    orderCinematicClips([
      { id: 'second', desktopSrc: '/two.mp4', duration: 1, order: 2 },
      { id: 'first', desktopSrc: '/one.mp4', duration: 1, order: 1 },
    ]).map((clip) => clip.id),
    ['first', 'second']
  )
  assert.equal(resolveCinematicLayer(responsive, 'mobile').width, 60)
  assert.equal(resolveCinematicLayer(responsive, 'mobile').x, 20)
})

test('public runtime is code split and uses one normalized GSAP progress source', () => {
  const section = readFileSync('components/website/scroll-experience/ScrollExperience.tsx', 'utf8')
  const runtime = readFileSync('components/website/cinematic/CinematicRenderer.tsx', 'utf8')
  assert.match(section, /normalizeCinematicConfig/)
  assert.match(runtime, /import\('gsap\/ScrollTrigger'\)/)
  assert.match(runtime, /timeline\.progress\(progress\)/)
  assert.match(runtime, /requestAnimationFrame/)
  assert.match(runtime, /scheduledProgressRef/)
  assert.match(runtime, /pendingMetadataProgressRef/)
  assert.match(runtime, /requestVideoFrameCallback/)
  assert.match(runtime, /mapped\.localProgress \* media\.duration/)
  assert.match(runtime, /visibilitychange/)
  assert.match(runtime, /pagehide/)
  assert.match(runtime, /pageshow/)
  assert.match(runtime, /media\.pause\(\)/)
  assert.match(runtime, /lastSeekRef\.current = -1/)
  assert.match(runtime, /ScrollTrigger\.refresh\(\)/)
  assert.match(runtime, /document\.hidden/)
  assert.match(runtime, /removeEventListener\('visibilitychange'/)
  assert.doesNotMatch(runtime, /config\.engine !== 'layers' && videoState !== 'error'/)
  assert.match(runtime, /context\.revert\(\)/)
  assert.match(runtime, /prefers-reduced-motion: reduce/)
})

test('publish validation accepts layers and rejects a video configuration without media', () => {
  const layers = getCinematicPreset('Product Reveal')
  assert.equal(
    validateCinematicConfigs({
      pages: [
        { sections: [{ section_type: 'scroll_experience', content: { cinematic: layers } }] },
      ],
    }).ok,
    true
  )
  const video = getCinematicPreset('Video Scroll')
  assert.equal(
    validateCinematicConfigs({
      pages: [{ sections: [{ section_type: 'scroll_experience', content: { cinematic: video } }] }],
    }).ok,
    false
  )
})
