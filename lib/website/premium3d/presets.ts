// lib/website/premium3d/presets.ts
//
// Static, JSON-serializable presets for the Premium 3D Scroll Hero section.
// Used by the builder editor (industry presets dropdown) and the AI section
// recommender. Safe for both server and client.

import type {
  AnimationPreset,
  EnvironmentPreset,
  LightingPreset,
  Premium3DScrollHeroContent,
  ScrollHeroPalette,
  ScrollHeroRenderMode,
  TextAnimation,
} from './types'

export interface IndustryPreset {
  key:           string
  label:         string
  description:   string
  industry:      string
  renderMode:    ScrollHeroRenderMode
  animationPreset: AnimationPreset
  lightingPreset?: LightingPreset
  environmentPreset?: EnvironmentPreset
  textAnimation: TextAnimation
  useImageSequence?: boolean
  palette:       ScrollHeroPalette
  /** Partial overrides applied on top of the section default content */
  content:       Partial<Premium3DScrollHeroContent>
  /** What asset the business should provide for the full effect */
  assetNeeded:   string
}

export const INDUSTRY_PRESETS: IndustryPreset[] = [
  {
    key: 'product_spin', label: 'Shoes / Product Spin', industry: 'retail',
    description: 'A product rotates in 3D revealing every angle on scroll.',
    renderMode: 'three_model', animationPreset: 'productSpin',
    lightingPreset: 'studioSoftbox', environmentPreset: 'studio',
    textAnimation: 'fadeUpWords',
    palette: { background: '#0c0c14', foreground: '#fafafa', accent: '#f59e0b', muted: '#a1a1aa', glow: '#fbbf24' },
    content: { initialRotation: { x: 0, y: 0, z: 0 }, targetRotation: { x: 0, y: Math.PI * 2, z: 0 }, cameraPath: 'orbit', cameraZoom: 1 },
    assetNeeded: 'A compressed GLB/GLTF of the product (or a product fallback image).',
  },
  {
    key: 'construction_build', label: 'Construction Home Build', industry: 'construction',
    description: 'Foundation → framing → roof → exterior → finished home on scroll.',
    renderMode: 'video_scrub', animationPreset: 'stageReveal',
    textAnimation: 'blurReveal', useImageSequence: true,
    palette: { background: '#0d0f14', foreground: '#f8fafc', accent: '#f97316', muted: '#94a3b8', glow: '#fb923c' },
    content: { stageRevealMode: 'sequential', mobileFallbackMode: 'poster' },
    assetNeeded: 'An H.264 MP4 build sequence or an image sequence (or a staged GLB home model).',
  },
  {
    key: 'dish_reveal', label: 'Restaurant Dish Reveal', industry: 'restaurant',
    description: 'Ingredients assemble into a finished dish through scroll.',
    renderMode: 'video_scrub', animationPreset: 'stageReveal',
    textAnimation: 'scaleWords',
    palette: { background: '#140d0a', foreground: '#fff7ed', accent: '#ef4444', muted: '#d6b8a3', glow: '#f87171' },
    content: { mobileFallbackMode: 'poster' },
    assetNeeded: 'An H.264 MP4 of the dish being prepared (or a staged GLB).',
  },
  {
    key: 'vehicle_showroom', label: 'Car Rental Vehicle Showcase', industry: 'automotive',
    description: 'A vehicle orbits like a premium showroom turntable.',
    renderMode: 'three_model', animationPreset: 'showroomOrbit',
    lightingPreset: 'showroom', environmentPreset: 'city',
    textAnimation: 'luxurySplit',
    palette: { background: '#0a0d12', foreground: '#f1f5f9', accent: '#38bdf8', muted: '#94a3b8', glow: '#7dd3fc' },
    content: { initialRotation: { x: 0, y: -0.6, z: 0 }, targetRotation: { x: 0, y: 2.4, z: 0 }, cameraZoom: 1.1, cameraPath: 'arc' },
    assetNeeded: 'A compressed GLB/GLTF of the vehicle.',
  },
  {
    key: 'salon_makeover', label: 'Salon Makeover', industry: 'beauty',
    description: 'A before/after makeover story revealed by scrolling.',
    renderMode: 'video_scrub', animationPreset: 'beforeAfter',
    textAnimation: 'fadeUpWords', useImageSequence: true,
    palette: { background: '#130a12', foreground: '#fdf2f8', accent: '#ec4899', muted: '#cba5bd', glow: '#f472b6' },
    content: { mobileFallbackMode: 'poster' },
    assetNeeded: 'A before/after MP4 or image sequence.',
  },
  {
    key: 'luxury_abstract', label: 'Law Firm Premium Abstract', industry: 'legal',
    description: 'A refined abstract premium scene for professional services.',
    renderMode: 'three_model', animationPreset: 'premiumAbstract',
    lightingPreset: 'luxuryGlow', environmentPreset: 'none',
    textAnimation: 'luxurySplit',
    palette: { background: '#0a0c14', foreground: '#eef2ff', accent: '#c7a14a', muted: '#9ca3af', glow: '#e5c97b' },
    content: { shaderPreset: 'premiumGlow', cameraPath: 'dollyIn' },
    assetNeeded: 'Optional GLB (scales of justice, city, documents) — works as a premium abstract scene without one.',
  },
  {
    key: 'trades_tool_orbit', label: 'Plumbing / Trades Tool Orbit', industry: 'trades',
    description: 'Tools, pipes and water flow orbit through the service steps.',
    renderMode: 'three_model', animationPreset: 'toolOrbit',
    lightingPreset: 'outdoorConstruction', environmentPreset: 'warehouse',
    textAnimation: 'fadeUpWords',
    palette: { background: '#0b1014', foreground: '#ecfeff', accent: '#06b6d4', muted: '#94a3b8', glow: '#22d3ee' },
    content: { cameraPath: 'orbit' },
    assetNeeded: 'A GLB of tools/pipes (or a video of the service process).',
  },
  {
    key: 'fitness_transformation', label: 'Fitness Transformation', industry: 'fitness',
    description: 'A transformation story that animates through scroll.',
    renderMode: 'video_scrub', animationPreset: 'beforeAfter',
    textAnimation: 'scaleWords', useImageSequence: true,
    palette: { background: '#0c1110', foreground: '#ecfdf5', accent: '#22c55e', muted: '#9ca3af', glow: '#4ade80' },
    content: { mobileFallbackMode: 'poster' },
    assetNeeded: 'A transformation MP4 or image sequence.',
  },
  {
    key: 'mascot_intro', label: 'Character / Mascot Intro', industry: 'entertainment',
    description: 'A brand character or mascot animates in on scroll.',
    renderMode: 'three_model', animationPreset: 'characterIntro',
    lightingPreset: 'premiumSpotlight', environmentPreset: 'studio',
    textAnimation: 'scaleWords',
    palette: { background: '#0d0a16', foreground: '#f5f3ff', accent: '#8b5cf6', muted: '#a1a1aa', glow: '#a78bfa' },
    content: { cameraPath: 'craneUp' },
    assetNeeded: 'A GLB/GLTF of the character or mascot.',
  },
  {
    key: 'luxury_service_reveal', label: 'Luxury Service Reveal', industry: 'services',
    description: 'A cinematic premium reveal for high-end services.',
    renderMode: 'video_scrub', animationPreset: 'stageReveal',
    textAnimation: 'luxurySplit',
    palette: { background: '#0a0a0f', foreground: '#fafafa', accent: '#c7a14a', muted: '#9ca3af', glow: '#e5c97b' },
    content: { shaderPreset: 'premiumGlow', mobileFallbackMode: 'poster' },
    assetNeeded: 'A cinematic H.264 MP4 (or image sequence).',
  },
]

export const INDUSTRY_PRESET_MAP = new Map(INDUSTRY_PRESETS.map((p) => [p.key, p]))

/** Build full section content from an industry preset key, merged over defaults */
export function buildContentFromPreset(
  presetKey: string,
  base: Premium3DScrollHeroContent,
): Premium3DScrollHeroContent {
  const preset = INDUSTRY_PRESET_MAP.get(presetKey)
  if (!preset) return base
  return {
    ...base,
    renderMode:        preset.renderMode,
    animationPreset:   preset.animationPreset,
    lightingPreset:    preset.lightingPreset ?? base.lightingPreset,
    environmentPreset: preset.environmentPreset ?? base.environmentPreset,
    textAnimation:     preset.textAnimation,
    useImageSequence:  preset.useImageSequence ?? base.useImageSequence,
    palette:           { ...preset.palette },
    presetKey:         preset.key,
    ...preset.content,
  }
}

// ── Scene config consumed by the client Three.js scene ────────────────────────

export interface LightingConfig {
  ambient:     number
  key:         number
  fill:        number
  rim:         number
  keyColor:    string
  rimColor:    string
  background:  string
}

export const LIGHTING_PRESETS: Record<LightingPreset, LightingConfig> = {
  studioSoftbox:      { ambient: 0.6, key: 1.1, fill: 0.5, rim: 0.4, keyColor: '#ffffff', rimColor: '#e0e7ff', background: '#0c0c14' },
  premiumSpotlight:   { ambient: 0.25, key: 1.6, fill: 0.2, rim: 0.7, keyColor: '#fff7ed', rimColor: '#a78bfa', background: '#0d0a16' },
  outdoorConstruction:{ ambient: 0.9, key: 1.2, fill: 0.7, rim: 0.3, keyColor: '#fffbeb', rimColor: '#bae6fd', background: '#0b1014' },
  luxuryGlow:         { ambient: 0.4, key: 0.9, fill: 0.4, rim: 0.9, keyColor: '#fde68a', rimColor: '#e5c97b', background: '#0a0c14' },
  showroom:           { ambient: 0.7, key: 1.4, fill: 0.6, rim: 0.6, keyColor: '#ffffff', rimColor: '#7dd3fc', background: '#0a0d12' },
}

/** drei <Environment> preset names. 'none' means no environment (cheap). */
export const ENVIRONMENT_DREI_PRESET: Record<EnvironmentPreset, string | null> = {
  none:      null,
  studio:    'studio',
  city:      'city',
  warehouse: 'warehouse',
  sunset:    'sunset',
  dawn:      'dawn',
  night:     'night',
}

/** Named groups in a GLB that the scene will reveal sequentially on scroll */
export const STAGE_GROUP_NAMES = [
  'stage_foundation',
  'stage_frame',
  'stage_roof',
  'stage_exterior',
  'stage_finished',
] as const
