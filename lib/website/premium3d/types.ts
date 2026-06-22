// lib/website/premium3d/types.ts
//
// Shared, framework-agnostic types for the "Premium 3D Scroll Hero" section.
// Safe to import from BOTH server and client components — contains no secrets
// and no browser-only / WebGL code.
//
// NOTE: There is intentionally NO Spline support anywhere in this feature.
// Only two render modes exist:
//   • three_model — real-time GLB/GLTF via Three.js / React Three Fiber
//   • video_scrub — scroll-scrubbed H.264 MP4 video and/or image sequences

export type ScrollHeroRenderMode = 'three_model' | 'video_scrub'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface ScrollHeroPalette {
  background: string
  foreground: string
  accent:     string
  muted:      string
  glow:       string
}

export type LightingPreset =
  | 'studioSoftbox'
  | 'premiumSpotlight'
  | 'outdoorConstruction'
  | 'luxuryGlow'
  | 'showroom'

export type EnvironmentPreset =
  | 'none'
  | 'studio'
  | 'city'
  | 'warehouse'
  | 'sunset'
  | 'dawn'
  | 'night'

export type AnimationPreset =
  | 'productSpin'
  | 'showroomOrbit'
  | 'stageReveal'
  | 'premiumAbstract'
  | 'characterIntro'
  | 'toolOrbit'
  | 'beforeAfter'
  | 'custom'

export type TextAnimation =
  | 'fadeUpWords'
  | 'blurReveal'
  | 'scaleWords'
  | 'luxurySplit'
  | 'none'

export type ShaderPreset =
  | 'none'
  | 'liquidReveal'
  | 'softGlass'
  | 'heatWave'
  | 'premiumGlow'
  | 'pageRipple'
  | 'productAura'

export type CameraPathPreset =
  | 'static'
  | 'orbit'
  | 'dollyIn'
  | 'craneUp'
  | 'arc'

export type StageRevealMode = 'none' | 'sequential' | 'crossfade'

/**
 * What mobile devices should show instead of a heavy 3D / full video scrub.
 * Superset union: legacy values (lowRes/fullScrub/staticImage) and the Media
 * Studio values (static/reduced_video/full_scrub/image_sequence) both validate.
 */
export type MobileFallbackMode =
  | 'poster'
  | 'static'
  | 'staticImage'
  | 'reduced_video'
  | 'lowRes'
  | 'full_scrub'
  | 'fullScrub'
  | 'image_sequence'

/** What reduced-motion users should see (no scroll-driven animation) */
export type ReducedMotionFallback = 'poster' | 'static' | 'staticImage' | 'firstFrame'

/** Hero section height options */
export type HeroHeight = '100vh' | '120vh' | '150vh' | 'custom'

/** When the overlay copy reveals across the scroll timeline */
export type TextRevealTiming = 'early' | 'middle' | 'late'

/** Horizontal alignment of the overlay copy */
export type ContentAlignment = 'left' | 'center' | 'right'

/** How image-sequence frames are ordered */
export type FrameOrder = 'filename' | 'upload' | 'manual'

/** How many image-sequence frames to preload */
export type FramePreloadStrategy = 'nearby' | 'first20' | 'all'

export type VideoScrubQuality = 'auto' | 'high' | 'medium' | 'low'
export type VideoObjectFit = 'cover' | 'contain'

/** Whether video_scrub mode uses an MP4 video or a frame image sequence */
export type VideoScrubSubMode = 'video' | 'image_sequence'
export type VideoPreload = 'metadata' | 'auto' | 'none'

/**
 * Structured video/image-scrub settings (Media Manager). This is an additive,
 * convenience mirror of the canonical flat fields (videoUrl, useImageSequence,
 * scrubSmoothing, …). `normalizeScrollHeroContent` always derives a fully
 * populated `videoScrub` object from the flat fields so both old and new
 * persisted sections work. The flat fields remain the runtime source of truth.
 */
export interface VideoScrubSettings {
  enabled:               boolean
  mode:                  VideoScrubSubMode
  playbackBehavior:      'scroll_scrub'
  pinOnScroll:           boolean
  scrollLength:          number
  scrubSmoothing:        number
  preload:               VideoPreload
  muted:                 boolean
  playsInline:           boolean
  loop:                  boolean
  objectFit:             VideoObjectFit
  mobileFallbackMode:    MobileFallbackMode
  reducedMotionFallback: ReducedMotionFallback
  startTime?:            number | null
  endTime?:              number | null
  fps?:                  number | null
  // ── Media Studio presentation controls ──
  overlayOpacity:           number
  backgroundGradientStrength: number
  heroHeight:               HeroHeight
  customHeroHeight?:        string | null
  textRevealTiming:         TextRevealTiming
  contentAlignment:         ContentAlignment
  // ── Image-sequence controls ──
  frameOrder?:              FrameOrder
  preloadStrategy?:         FramePreloadStrategy
}

/** Optional camera keyframe used by an advanced custom scrollTimeline */
export interface CameraKeyframe {
  /** 0..1 scroll progress */
  at:        number
  position?: Vec3
  zoom?:     number
}

/** Optional object keyframe used by an advanced custom scrollTimeline */
export interface ObjectKeyframe {
  /** 0..1 scroll progress */
  at:        number
  rotation?: Vec3
  position?: Vec3
  scale?:    number
  opacity?:  number
}

export interface ScrollTimeline {
  camera?: CameraKeyframe[]
  object?: ObjectKeyframe[]
}

export interface ScrollHeroCta {
  label: string
  href:  string
}

/**
 * The full section config persisted under site_sections.content for a
 * premium_3d_scroll_hero section. Every field beyond renderMode is optional so
 * the section always renders something safe even with missing data.
 */
export interface Premium3DScrollHeroContent {
  sectionType: 'premium_3d_scroll_hero'
  renderMode:  ScrollHeroRenderMode

  // ── Assets ──
  assetId?:           string | null
  modelUrl?:          string | null
  videoUrl?:          string | null
  imageSequenceUrls?: string[]
  posterUrl?:         string | null
  fallbackImageUrl?:  string | null
  environmentUrl?:    string | null

  // ── Active asset references (Media Manager / version history) ──
  activeAssetId?:              string | null
  activeVideoAssetId?:         string | null
  activeImageSequenceAssetId?: string | null
  posterAssetId?:             string | null
  fallbackAssetId?:           string | null

  // ── Structured video scrub settings (derived mirror of flat fields) ──
  videoScrub?: VideoScrubSettings

  // ── Copy ──
  eyebrow?:      string
  headline:      string
  subheadline?:  string
  ctaPrimary?:   ScrollHeroCta | null
  ctaSecondary?: ScrollHeroCta | null

  // ── Palette ──
  palette?:              ScrollHeroPalette
  /** When true, swap global website CSS vars while this section is in view */
  applyPaletteGlobally?: boolean

  // ── Animation / scene ──
  scrollTimeline?:     ScrollTimeline
  cameraPath?:         CameraPathPreset
  lightingPreset?:     LightingPreset
  environmentPreset?:  EnvironmentPreset
  animationPreset?:    AnimationPreset
  textAnimation?:      TextAnimation
  shaderPreset?:       ShaderPreset
  stageRevealMode?:    StageRevealMode

  // ── Behaviour ──
  pinOnScroll?:           boolean
  /** Scroll length as a multiple of viewport height (1 = 100vh of scroll) */
  scrollLength?:          number
  /** 0 (snappy) .. 1 (very smooth) lerp factor for scrubbing */
  scrubSmoothing?:        number
  useImageSequence?:      boolean
  videoObjectFit?:        VideoObjectFit
  videoScrubQuality?:     VideoScrubQuality
  mobileFallbackMode?:    MobileFallbackMode
  reducedMotionFallback?: ReducedMotionFallback
  // ── Presentation (flat mirror of videoScrub for the renderer) ──
  overlayOpacity?:            number
  backgroundGradientStrength?: number
  heroHeight?:                HeroHeight
  customHeroHeight?:          string | null
  textRevealTiming?:          TextRevealTiming
  contentAlignment?:          ContentAlignment

  // ── three_model tuning ──
  modelScale?:      number
  initialRotation?: Vec3
  targetRotation?:  Vec3
  cameraZoom?:      number
  rotationSpeed?:   number
  shadowIntensity?: number

  // ── Meta ──
  presetKey?: string
  /** Set by AI autofill when no real asset exists yet (never fakes assets) */
  assetPlaceholder?: boolean
  /** Set by AI/templates when the section still needs a real uploaded asset */
  assetNeeded?:      boolean
  /** Human-readable note describing what asset is still needed */
  assetNeededNote?:  string
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_SCROLL_HERO_PALETTE: ScrollHeroPalette = {
  background: '#0b0b12',
  foreground: '#f5f5f7',
  accent:     '#7c3aed',
  muted:      '#a1a1aa',
  glow:       '#a855f7',
}

export function defaultPremium3DScrollHeroContent(): Premium3DScrollHeroContent {
  return {
    sectionType:           'premium_3d_scroll_hero',
    renderMode:            'three_model',
    headline:              'Experience It In Motion',
    subheadline:           'Scroll to explore every detail.',
    eyebrow:               'Premium',
    ctaPrimary:            { label: 'Get Started', href: '#contact' },
    ctaSecondary:          null,
    palette:               { ...DEFAULT_SCROLL_HERO_PALETTE },
    applyPaletteGlobally:  false,
    cameraPath:            'orbit',
    lightingPreset:        'studioSoftbox',
    environmentPreset:     'studio',
    animationPreset:       'productSpin',
    textAnimation:         'fadeUpWords',
    shaderPreset:          'none',
    stageRevealMode:       'none',
    pinOnScroll:           true,
    scrollLength:          2.5,
    scrubSmoothing:        0.12,
    useImageSequence:      false,
    videoObjectFit:        'cover',
    videoScrubQuality:     'auto',
    mobileFallbackMode:    'poster',
    reducedMotionFallback: 'poster',
    overlayOpacity:        0.35,
    backgroundGradientStrength: 0.45,
    heroHeight:            '100vh',
    customHeroHeight:      null,
    textRevealTiming:      'middle',
    contentAlignment:      'left',
    modelScale:            1,
    initialRotation:       { x: 0, y: 0, z: 0 },
    targetRotation:        { x: 0, y: Math.PI * 2, z: 0 },
    cameraZoom:            1,
    rotationSpeed:         1,
    shadowIntensity:       0.6,
    assetPlaceholder:      true,
    assetNeededNote:       'Upload a GLB/GLTF model (3D mode) or an H.264 MP4 / image sequence (video mode) for the full effect.',
  }
}

// ── Safe normalizer (never throws) ────────────────────────────────────────────

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : fallback
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  if (v === 'true') return true
  if (v === 'false') return false
  return fallback
}
function vec3(v: unknown, fallback: Vec3): Vec3 {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return { x: num(o.x, fallback.x), y: num(o.y, fallback.y), z: num(o.z, fallback.z) }
  }
  return { ...fallback }
}
function cta(v: unknown): ScrollHeroCta | null {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const label = str(o.label)
    const href = str(o.href)
    if (label || href) return { label: label || 'Learn More', href: href || '#' }
  }
  return null
}

/**
 * Coerce any persisted content object into a well-formed
 * Premium3DScrollHeroContent. Never throws; fills sensible defaults.
 */
export function normalizeScrollHeroContent(raw: unknown): Premium3DScrollHeroContent {
  const d = defaultPremium3DScrollHeroContent()
  if (!raw || typeof raw !== 'object') return d
  const c = raw as Record<string, unknown>

  const renderMode: ScrollHeroRenderMode =
    c.renderMode === 'video_scrub' ? 'video_scrub' : 'three_model'

  const imageSequenceUrls = Array.isArray(c.imageSequenceUrls)
    ? (c.imageSequenceUrls as unknown[]).filter((u): u is string => typeof u === 'string')
    : undefined

  const palette = c.palette && typeof c.palette === 'object'
    ? {
        background: str((c.palette as Record<string, unknown>).background, d.palette!.background),
        foreground: str((c.palette as Record<string, unknown>).foreground, d.palette!.foreground),
        accent:     str((c.palette as Record<string, unknown>).accent,     d.palette!.accent),
        muted:      str((c.palette as Record<string, unknown>).muted,      d.palette!.muted),
        glow:       str((c.palette as Record<string, unknown>).glow,       d.palette!.glow),
      }
    : d.palette

  // Structured videoScrub settings: read persisted overrides if present, else
  // derive from the canonical flat fields so old sections keep working.
  const vsRaw = (c.videoScrub && typeof c.videoScrub === 'object')
    ? (c.videoScrub as Record<string, unknown>)
    : {}
  const useSeq = bool(c.useImageSequence, !!d.useImageSequence)
  const scrubSmoothing = Math.min(1, Math.max(0, num(c.scrubSmoothing, d.scrubSmoothing!)))
  const objectFit = (str(c.videoObjectFit, d.videoObjectFit!) as VideoObjectFit)
  const mobileFallbackMode = (str(c.mobileFallbackMode, d.mobileFallbackMode!) as MobileFallbackMode)
  const reducedMotionFallback = (str(c.reducedMotionFallback, d.reducedMotionFallback!) as ReducedMotionFallback)
  const pinOnScroll = bool(c.pinOnScroll, !!d.pinOnScroll)
  const scrollLength = num(c.scrollLength, d.scrollLength!)
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
  const overlayOpacity = clamp01(num(c.overlayOpacity, d.overlayOpacity!))
  const backgroundGradientStrength = clamp01(num(c.backgroundGradientStrength, d.backgroundGradientStrength!))
  const heroHeight = (['100vh', '120vh', '150vh', 'custom'].includes(str(c.heroHeight))
    ? str(c.heroHeight) : d.heroHeight!) as HeroHeight
  const customHeroHeight = c.customHeroHeight ? str(c.customHeroHeight) : null
  const textRevealTiming = (['early', 'middle', 'late'].includes(str(c.textRevealTiming))
    ? str(c.textRevealTiming) : d.textRevealTiming!) as TextRevealTiming
  const contentAlignment = (['left', 'center', 'right'].includes(str(c.contentAlignment))
    ? str(c.contentAlignment) : d.contentAlignment!) as ContentAlignment

  const videoScrub: VideoScrubSettings = {
    enabled:               bool(vsRaw.enabled, renderMode === 'video_scrub'),
    mode:                  (vsRaw.mode === 'image_sequence' || useSeq) ? 'image_sequence' : 'video',
    playbackBehavior:      'scroll_scrub',
    pinOnScroll:           bool(vsRaw.pinOnScroll, pinOnScroll),
    scrollLength:          num(vsRaw.scrollLength, scrollLength),
    scrubSmoothing:        clamp01(num(vsRaw.scrubSmoothing, scrubSmoothing)),
    preload:               (str(vsRaw.preload, 'metadata') as VideoPreload),
    muted:                 bool(vsRaw.muted, true),
    playsInline:           bool(vsRaw.playsInline, true),
    loop:                  bool(vsRaw.loop, false),
    objectFit:             (str(vsRaw.objectFit, objectFit) as VideoObjectFit),
    mobileFallbackMode:    (str(vsRaw.mobileFallbackMode, mobileFallbackMode) as MobileFallbackMode),
    reducedMotionFallback: (str(vsRaw.reducedMotionFallback, reducedMotionFallback) as ReducedMotionFallback),
    startTime:             vsRaw.startTime != null ? num(vsRaw.startTime, 0) : undefined,
    endTime:               vsRaw.endTime != null ? num(vsRaw.endTime, 0) : undefined,
    fps:                   vsRaw.fps != null ? num(vsRaw.fps, 30) : undefined,
    overlayOpacity:           clamp01(num(vsRaw.overlayOpacity, overlayOpacity)),
    backgroundGradientStrength: clamp01(num(vsRaw.backgroundGradientStrength, backgroundGradientStrength)),
    heroHeight:               (['100vh', '120vh', '150vh', 'custom'].includes(str(vsRaw.heroHeight))
                                ? str(vsRaw.heroHeight) : heroHeight) as HeroHeight,
    customHeroHeight:         vsRaw.customHeroHeight ? str(vsRaw.customHeroHeight) : customHeroHeight,
    textRevealTiming:         (['early', 'middle', 'late'].includes(str(vsRaw.textRevealTiming))
                                ? str(vsRaw.textRevealTiming) : textRevealTiming) as TextRevealTiming,
    contentAlignment:         (['left', 'center', 'right'].includes(str(vsRaw.contentAlignment))
                                ? str(vsRaw.contentAlignment) : contentAlignment) as ContentAlignment,
    frameOrder:               (['filename', 'upload', 'manual'].includes(str(vsRaw.frameOrder))
                                ? str(vsRaw.frameOrder) : 'filename') as FrameOrder,
    preloadStrategy:          (['nearby', 'first20', 'all'].includes(str(vsRaw.preloadStrategy))
                                ? str(vsRaw.preloadStrategy) : 'nearby') as FramePreloadStrategy,
  }

  return {
    sectionType:           'premium_3d_scroll_hero',
    renderMode,
    assetId:               c.assetId ? str(c.assetId) : null,
    modelUrl:              c.modelUrl ? str(c.modelUrl) : null,
    videoUrl:              c.videoUrl ? str(c.videoUrl) : null,
    imageSequenceUrls,
    posterUrl:             c.posterUrl ? str(c.posterUrl) : null,
    fallbackImageUrl:      c.fallbackImageUrl ? str(c.fallbackImageUrl) : null,
    environmentUrl:        c.environmentUrl ? str(c.environmentUrl) : null,
    activeAssetId:              c.activeAssetId ? str(c.activeAssetId) : null,
    activeVideoAssetId:         c.activeVideoAssetId ? str(c.activeVideoAssetId) : null,
    activeImageSequenceAssetId: c.activeImageSequenceAssetId ? str(c.activeImageSequenceAssetId) : null,
    posterAssetId:             c.posterAssetId ? str(c.posterAssetId) : null,
    fallbackAssetId:           c.fallbackAssetId ? str(c.fallbackAssetId) : null,
    videoScrub,
    eyebrow:               str(c.eyebrow, d.eyebrow),
    headline:              str(c.headline, d.headline),
    subheadline:           str(c.subheadline, d.subheadline),
    ctaPrimary:            'ctaPrimary' in c ? cta(c.ctaPrimary) : d.ctaPrimary,
    ctaSecondary:          'ctaSecondary' in c ? cta(c.ctaSecondary) : d.ctaSecondary,
    palette,
    applyPaletteGlobally:  bool(c.applyPaletteGlobally, !!d.applyPaletteGlobally),
    scrollTimeline:        (c.scrollTimeline && typeof c.scrollTimeline === 'object')
                              ? (c.scrollTimeline as ScrollTimeline)
                              : undefined,
    cameraPath:            (str(c.cameraPath, d.cameraPath!) as CameraPathPreset),
    lightingPreset:        (str(c.lightingPreset, d.lightingPreset!) as LightingPreset),
    environmentPreset:     (str(c.environmentPreset, d.environmentPreset!) as EnvironmentPreset),
    animationPreset:       (str(c.animationPreset, d.animationPreset!) as AnimationPreset),
    textAnimation:         (str(c.textAnimation, d.textAnimation!) as TextAnimation),
    shaderPreset:          (str(c.shaderPreset, d.shaderPreset!) as ShaderPreset),
    stageRevealMode:       (str(c.stageRevealMode, d.stageRevealMode!) as StageRevealMode),
    pinOnScroll:           bool(c.pinOnScroll, !!d.pinOnScroll),
    scrollLength:          num(c.scrollLength, d.scrollLength!),
    scrubSmoothing:        Math.min(1, Math.max(0, num(c.scrubSmoothing, d.scrubSmoothing!))),
    useImageSequence:      bool(c.useImageSequence, !!d.useImageSequence),
    videoObjectFit:        (str(c.videoObjectFit, d.videoObjectFit!) as VideoObjectFit),
    videoScrubQuality:     (str(c.videoScrubQuality, d.videoScrubQuality!) as VideoScrubQuality),
    mobileFallbackMode:    (str(c.mobileFallbackMode, d.mobileFallbackMode!) as MobileFallbackMode),
    reducedMotionFallback: (str(c.reducedMotionFallback, d.reducedMotionFallback!) as ReducedMotionFallback),
    overlayOpacity,
    backgroundGradientStrength,
    heroHeight,
    customHeroHeight,
    textRevealTiming,
    contentAlignment,
    modelScale:            num(c.modelScale, d.modelScale!),
    initialRotation:       vec3(c.initialRotation, d.initialRotation!),
    targetRotation:        vec3(c.targetRotation, d.targetRotation!),
    cameraZoom:            num(c.cameraZoom, d.cameraZoom!),
    rotationSpeed:         num(c.rotationSpeed, d.rotationSpeed!),
    shadowIntensity:       Math.min(1, Math.max(0, num(c.shadowIntensity, d.shadowIntensity!))),
    presetKey:             c.presetKey ? str(c.presetKey) : undefined,
    assetPlaceholder:      bool(c.assetPlaceholder, false),
    assetNeeded:           bool(c.assetNeeded, false),
    assetNeededNote:       c.assetNeededNote ? str(c.assetNeededNote) : undefined,
  }
}

/** True when the section has a usable asset for its render mode */
export function hasUsableAsset(content: Premium3DScrollHeroContent): boolean {
  if (content.renderMode === 'three_model') {
    return !!content.modelUrl
  }
  if (content.useImageSequence) {
    return !!(content.imageSequenceUrls && content.imageSequenceUrls.length > 1)
  }
  return !!content.videoUrl
}
