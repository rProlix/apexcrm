import type { CinematicConfig, CinematicLayer, CinematicTrack } from './schema'

const scene = {
  id: 'main',
  name: 'Story',
  startProgress: 0,
  endProgress: 1,
  background: '#101012',
  transition: 'crossfade' as const,
}
const base = (
  name: string,
  engine: CinematicConfig['engine'],
  background: string
): CinematicConfig => ({
  version: 1,
  name,
  engine,
  section: { scrollLength: 400, pinned: true, smoothScroll: false, background, snap: false },
  scenes: [{ ...scene, background }],
  layers: [],
  tracks: [],
  video: engine === 'layers' ? null : { clips: [], fit: 'cover', focalPoint: { x: 50, y: 50 } },
  accessibility: { ariaLabel: name, reducedMotion: 'poster' },
})

const layer = (
  value: Partial<CinematicLayer> & Pick<CinematicLayer, 'id' | 'type' | 'name'>
): CinematicLayer => ({
  sceneId: 'main',
  content: '',
  alt: '',
  decorative: false,
  locked: false,
  hidden: false,
  x: 50,
  y: 50,
  width: 44,
  zIndex: 2,
  color: '#ffffff',
  fontSize: 52,
  textAlign: 'left',
  fit: 'contain',
  visibleOn: ['desktop', 'tablet', 'mobile'],
  baseTransform: {},
  ...value,
})
const track = (
  value: Partial<CinematicTrack> & Pick<CinematicTrack, 'id' | 'layerId' | 'name'>
): CinematicTrack => ({
  startProgress: 0,
  endProgress: 0.35,
  from: { opacity: 0, y: 80, scale: 0.92 },
  to: { opacity: 1, y: 0, scale: 1 },
  easing: 'power2',
  enabled: true,
  ...value,
})

function story(name: string, background: string, accent: string, productLabel: string) {
  const config = base(name, 'layers', background)
  config.layers = [
    layer({
      id: 'eyebrow',
      type: 'paragraph',
      name: 'Eyebrow',
      content: 'A STORY IN MOTION',
      x: 10,
      y: 18,
      width: 45,
      fontSize: 14,
      color: accent,
    }),
    layer({
      id: 'headline',
      type: 'heading',
      name: 'Headline',
      content: productLabel,
      x: 10,
      y: 27,
      width: 72,
      fontSize: 88,
    }),
    layer({
      id: 'orb',
      type: 'shape',
      name: 'Product form',
      x: 61,
      y: 51,
      width: 28,
      zIndex: 1,
      color: accent,
      decorative: true,
    }),
    layer({
      id: 'detail',
      type: 'paragraph',
      name: 'Detail',
      content: 'Designed to reveal itself at the pace of your customer.',
      x: 55,
      y: 72,
      width: 34,
      fontSize: 18,
    }),
    layer({
      id: 'cta',
      type: 'button',
      name: 'Call to action',
      content: 'Explore the story',
      href: '/contact',
      x: 10,
      y: 76,
      width: 24,
      fontSize: 16,
    }),
  ]
  config.tracks = [
    track({
      id: 'headline-in',
      layerId: 'headline',
      name: 'Headline reveal',
      startProgress: 0.04,
      endProgress: 0.28,
    }),
    track({
      id: 'orb-zoom',
      layerId: 'orb',
      name: 'Product zoom',
      startProgress: 0.08,
      endProgress: 0.72,
      from: { scale: 0.55, rotation: -12, opacity: 0.35 },
      to: { scale: 1.45, rotation: 18, opacity: 1 },
      easing: 'sine',
    }),
    track({
      id: 'detail-in',
      layerId: 'detail',
      name: 'Detail reveal',
      startProgress: 0.48,
      endProgress: 0.72,
    }),
    track({
      id: 'cta-in',
      layerId: 'cta',
      name: 'CTA reveal',
      startProgress: 0.72,
      endProgress: 0.94,
    }),
  ]
  return config
}

const hybridLaunch = story(
  'Fullscreen Launch',
  '#050505',
  '#ff574d',
  'Introducing what comes next.'
)
hybridLaunch.engine = 'hybrid'
hybridLaunch.video = { clips: [], fit: 'cover', focalPoint: { x: 50, y: 50 } }

export const CINEMATIC_PRESETS: CinematicConfig[] = [
  story('Product Reveal', '#111113', '#d8ff65', 'Make the ordinary impossible to ignore.'),
  story('Luxury Product', '#0c0a09', '#d6b778', 'Craft, revealed one detail at a time.'),
  story('Automotive Showcase', '#080b10', '#61a8ff', 'Engineered for the road ahead.'),
  story('Restaurant Story', '#190e0a', '#ff9366', 'A table worth slowing down for.'),
  story('Coffee Product Story', '#1a100a', '#d89c64', 'From first crack to final pour.'),
  story('Service Journey', '#0b1514', '#73e4c3', 'A better experience, from hello to done.'),
  story('Before and After', '#121212', '#f1e8d4', 'See the transformation.'),
  story('Floating Product', '#13101d', '#c9a8ff', 'Weightless by design.'),
  story('Cinematic Hero', '#080808', '#f2f2ed', 'Your opening scene starts here.'),
  base('Video Scroll', 'video', '#080808'),
  base('Scroll World', 'video', '#080808'),
  story('SVG Journey', '#08131a', '#67d9ff', 'Follow the path.'),
  story('Feature Story', '#101319', '#ffce57', 'Every feature has a reason.'),
  hybridLaunch,
]

export function getCinematicPreset(name: string) {
  return CINEMATIC_PRESETS.find((preset) => preset.name === name) ?? CINEMATIC_PRESETS[0]
}
