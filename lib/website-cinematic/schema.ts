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
    rotation: z.number().finite().min(-1440).max(1440).default(0),
    opacity: z.number().finite().min(0).max(1).default(1),
    blur: z.number().finite().min(0).max(80).default(0),
  })
  .partial()

export const cinematicLayerSchema = z.object({
  id: z.string().min(1).max(80),
  sceneId: z.string().min(1).max(80),
  type: z.enum(['image', 'heading', 'paragraph', 'button', 'svg', 'shape', 'group']),
  name: z.string().min(1).max(120),
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
  zIndex: z.number().int().min(0).max(1000).default(1),
  color: z.string().max(100).default('#ffffff'),
  fontSize: z.number().finite().min(10).max(240).default(48),
  textAlign: z.enum(['left', 'center', 'right']).default('left'),
  fit: z.enum(['cover', 'contain', 'fill']).default('contain'),
  visibleOn: z.array(cinematicBreakpointSchema).default(['desktop', 'tablet', 'mobile']),
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
      .enum(['none', 'crossfade', 'zoom-through', 'slide', 'blur', 'scale', 'wipe'])
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
})

export const cinematicConfigSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1).max(120),
    engine: cinematicEngineSchema,
    section: z.object({
      scrollLength: z.number().int().min(150).max(1000).default(400),
      pinned: z.boolean().default(true),
      smoothScroll: z.boolean().default(false),
      background: z.string().max(200).default('#0b0b0d'),
      snap: z.boolean().default(false),
    }),
    scenes: z.array(cinematicSceneSchema).max(24),
    layers: z.array(cinematicLayerSchema).max(100),
    tracks: z.array(cinematicTrackSchema).max(300),
    video: z
      .object({
        clips: z.array(cinematicClipSchema).max(24),
        fit: z.enum(['cover', 'contain']).default('cover'),
        focalPoint: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
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
