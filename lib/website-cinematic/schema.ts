import { z } from 'zod'
import { safeScrollLink } from '@/lib/website-scroll-experience/types'

export const cinematicEngineSchema = z.enum(['layers', 'video', 'hybrid'])
export const cinematicBreakpointSchema = z.enum(['desktop', 'tablet', 'mobile'])

function safeAssetUrl(value: string) {
  if (value.startsWith('/') && !value.startsWith('//')) return true
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

const assetUrlSchema = z.string().max(2048).refine(safeAssetUrl, 'Asset URL is not allowed.')

const transformSchema = z
  .object({
    x: z.number().finite().min(-4000).max(4000).default(0),
    y: z.number().finite().min(-4000).max(4000).default(0),
    scale: z.number().finite().min(0.05).max(10).default(1),
    scaleX: z.number().finite().min(-10).max(10).default(1),
    scaleY: z.number().finite().min(-10).max(10).default(1),
    rotation: z.number().finite().min(-1440).max(1440).default(0),
    skewX: z.number().finite().min(-85).max(85).default(0),
    skewY: z.number().finite().min(-85).max(85).default(0),
    opacity: z.number().finite().min(0).max(1).default(1),
    blur: z.number().finite().min(0).max(80).default(0),
    brightness: z.number().finite().min(0).max(4).default(1),
    contrast: z.number().finite().min(0).max(4).default(1),
    saturation: z.number().finite().min(0).max(4).default(1),
  })
  .partial()

const responsiveLayerOverrideSchema = z
  .object({
    x: z.number().finite().min(-200).max(200),
    y: z.number().finite().min(-200).max(200),
    width: z.number().finite().min(1).max(200),
    height: z.number().finite().min(1).max(200),
    maxWidth: z.number().finite().min(1).max(4000),
    fontSize: z.number().finite().min(10).max(240),
    visible: z.boolean(),
    fit: z.enum(['cover', 'contain', 'fill']),
  })
  .partial()

export const cinematicLayerSchema = z.object({
  id: z.string().min(1).max(80),
  sceneId: z.string().min(1).max(80),
  type: z.enum([
    'image',
    'text',
    'heading',
    'paragraph',
    'button',
    'svg',
    'shape',
    'decorative',
    'background',
    'video',
    'group',
    'container',
  ]),
  name: z.string().min(1).max(120),
  parentId: z.string().min(1).max(80).optional(),
  content: z.string().max(4000).default(''),
  src: assetUrlSchema.optional(),
  href: z.string().max(2048).optional(),
  alt: z.string().max(300).default(''),
  decorative: z.boolean().default(false),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  x: z.number().finite().min(-200).max(200).default(50),
  y: z.number().finite().min(-200).max(200).default(50),
  width: z.number().finite().min(1).max(200).default(40),
  height: z.number().finite().min(1).max(200).optional(),
  maxWidth: z.number().finite().min(1).max(4000).optional(),
  aspectRatio: z.string().max(40).optional(),
  zIndex: z.number().int().min(0).max(1000).default(1),
  color: z.string().max(100).default('#ffffff'),
  fontSize: z.number().finite().min(10).max(240).default(48),
  fontFamily: z.string().max(200).default('inherit'),
  fontWeight: z.number().int().min(100).max(900).default(500),
  lineHeight: z.number().finite().min(0.7).max(3).default(1.1),
  letterSpacing: z.number().finite().min(-0.2).max(1).default(0),
  textAlign: z.enum(['left', 'center', 'right']).default('left'),
  fit: z.enum(['cover', 'contain', 'fill']).default('contain'),
  positionMode: z.enum(['absolute', 'relative']).default('absolute'),
  transformOrigin: z.string().max(80).default('center center'),
  borderRadius: z.number().finite().min(0).max(9999).default(0),
  shadow: z.string().max(300).default('none'),
  visibleOn: z.array(cinematicBreakpointSchema).default(['desktop', 'tablet', 'mobile']),
  responsive: z
    .object({
      desktop: responsiveLayerOverrideSchema.optional(),
      tablet: responsiveLayerOverrideSchema.optional(),
      mobile: responsiveLayerOverrideSchema.optional(),
    })
    .default({}),
  baseTransform: transformSchema.default({}),
  path: z.string().max(8000).optional(),
})

export const cinematicTrackSchema = z
  .object({
    id: z.string().min(1).max(80),
    layerId: z.string().min(1).max(80),
    name: z.string().min(1).max(120),
    startProgress: z.number().finite().min(0).max(1),
    endProgress: z.number().finite().min(0).max(1),
    from: transformSchema,
    to: transformSchema,
    easing: z.enum(['none', 'power1', 'power2', 'power3', 'expo', 'sine', 'back']),
    enabled: z.boolean().default(true),
    motionPath: z
      .object({ pathLayerId: z.string(), align: z.boolean().default(true), reverse: z.boolean() })
      .optional(),
    breakpointOverrides: z
      .object({
        desktop: z.object({ from: transformSchema, to: transformSchema }).partial().optional(),
        tablet: z.object({ from: transformSchema, to: transformSchema }).partial().optional(),
        mobile: z.object({ from: transformSchema, to: transformSchema }).partial().optional(),
      })
      .default({}),
  })
  .refine((track) => track.startProgress <= track.endProgress, {
    message: 'Animation start must not exceed its end.',
  })

export const cinematicSceneSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(120),
    startProgress: z.number().finite().min(0).max(1),
    endProgress: z.number().finite().min(0).max(1),
    background: z.string().max(200).default('#0b0b0d'),
    transition: z
      .enum([
        'none',
        'crossfade',
        'zoom-through',
        'slide',
        'blur',
        'scale',
        'wipe',
        'background-morph',
      ])
      .default('crossfade'),
  })
  .refine((scene) => scene.startProgress <= scene.endProgress)

export const cinematicClipSchema = z.object({
  id: z.string().min(1).max(80),
  desktopSrc: assetUrlSchema,
  mobileSrc: assetUrlSchema.optional(),
  poster: assetUrlSchema.optional(),
  duration: z.number().finite().positive().max(600),
  scrollWeight: z.number().finite().positive().max(100).default(1),
  seamOverlap: z.number().finite().min(0).max(0.08).default(0.015),
  order: z.number().int().min(0).max(1000).default(0),
  mobilePoster: assetUrlSchema.optional(),
  preload: z.enum(['none', 'metadata', 'auto']).default('metadata'),
})

export const cinematicConfigSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1).max(120),
    engine: cinematicEngineSchema,
    section: z.object({
      scrollLength: z.number().int().min(150).max(1000).default(400),
      pinned: z.boolean().default(true),
      scrub: z.boolean().default(true),
      start: z.string().max(80).default('top top'),
      end: z.string().max(80).default('bottom bottom'),
      smoothScroll: z.boolean().default(false),
      background: z.string().max(200).default('#0b0b0d'),
      overflow: z.enum(['hidden', 'visible']).default('hidden'),
      snap: z.boolean().default(false),
      loadingIndicator: z.boolean().default(true),
    }),
    responsive: z
      .object({
        desktop: z
          .object({ scrollLength: z.number().int().min(150).max(1000) })
          .partial()
          .optional(),
        tablet: z
          .object({ scrollLength: z.number().int().min(150).max(1000) })
          .partial()
          .optional(),
        mobile: z
          .object({ scrollLength: z.number().int().min(150).max(1000) })
          .partial()
          .optional(),
      })
      .default({}),
    scenes: z.array(cinematicSceneSchema).max(24),
    layers: z.array(cinematicLayerSchema).max(100),
    tracks: z.array(cinematicTrackSchema).max(300),
    video: z
      .object({
        clips: z.array(cinematicClipSchema).max(24),
        fit: z.enum(['cover', 'contain']).default('cover'),
        mobileFit: z.enum(['cover', 'contain', 'poster']).default('cover'),
        focalPoint: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
        mobileFocalPoint: z
          .object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })
          .optional(),
      })
      .nullable(),
    accessibility: z.object({
      ariaLabel: z.string().max(300).default('Cinematic story'),
      reducedMotion: z.enum(['poster', 'fade', 'none']).default('poster'),
      fallbackImage: assetUrlSchema.optional(),
    }),
  })
  .superRefine((config, context) => {
    const layerIds = new Set(config.layers.map((layer) => layer.id))
    if (layerIds.size !== config.layers.length)
      context.addIssue({ code: 'custom', message: 'Layer IDs must be unique.', path: ['layers'] })
    for (const [index, track] of config.tracks.entries()) {
      if (!layerIds.has(track.layerId))
        context.addIssue({
          code: 'custom',
          message: 'Animation target layer is missing.',
          path: ['tracks', index, 'layerId'],
        })
    }
    for (const [index, layer] of config.layers.entries()) {
      if (layer.parentId && (!layerIds.has(layer.parentId) || layer.parentId === layer.id))
        context.addIssue({
          code: 'custom',
          message: 'Layer parent is missing or invalid.',
          path: ['layers', index, 'parentId'],
        })
    }
    if (config.engine !== 'layers' && !config.video)
      context.addIssue({
        code: 'custom',
        message: 'Video and hybrid modes require video configuration.',
        path: ['video'],
      })
  })

export type CinematicConfig = z.infer<typeof cinematicConfigSchema>
export type CinematicLayer = z.infer<typeof cinematicLayerSchema>
export type CinematicTrack = z.infer<typeof cinematicTrackSchema>

export function normalizeCinematicConfig(value: unknown): CinematicConfig | null {
  const parsed = cinematicConfigSchema.safeParse(value)
  if (!parsed.success) return null
  return {
    ...parsed.data,
    layers: parsed.data.layers.map((layer) => ({
      ...layer,
      href: layer.type === 'button' ? safeScrollLink(layer.href) || undefined : undefined,
      src:
        layer.src && !/^javascript:/i.test(layer.src) && !/^data:text\/html/i.test(layer.src)
          ? layer.src
          : undefined,
    })),
  }
}
