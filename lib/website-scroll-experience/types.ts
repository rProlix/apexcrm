export type ScrollSmoothing = 'direct' | 'smooth' | 'cinematic'
export type ScrollFit = 'cover' | 'contain'
export type ScrollDirection = 'forward' | 'reverse'
export type ReducedMotionMode = 'poster' | 'fade' | 'none'

export type ScrollExperienceBeat = {
  id: string
  startProgress: number
  endProgress: number
  eyebrow?: string
  title?: string
  body?: string
  buttonLabel?: string
  buttonHref?: string
  alignment?: 'left' | 'center' | 'right'
  position?: 'top' | 'center' | 'bottom'
}

export type ScrollExperienceContent = {
  cinematic?: unknown
  experienceId?: string
  experienceVersionId?: string
  status?: string
  desktopBytes?: number
  mobileBytes?: number
  duration?: number
  posterUrl?: string
  mode: 'section' | 'full_page'
  scrollDistanceVh: number
  startTime: number
  endTime?: number
  smoothing: ScrollSmoothing
  direction: ScrollDirection
  fit: ScrollFit
  mobileFit: 'cover' | 'contain' | 'center_crop'
  position: 'center' | 'top' | 'bottom'
  overlayOpacity: number
  overlayStyle: 'solid' | 'gradient' | 'vignette'
  backgroundColor: string
  heading?: string
  eyebrow?: string
  body?: string
  buttonLabel?: string
  buttonHref?: string
  textAlign: 'left' | 'center' | 'right'
  contentPosition: 'top' | 'center' | 'bottom'
  beats: ScrollExperienceBeat[]
  showProgressNavigation: boolean
  reducedMotionMode: ReducedMotionMode
  previewInteraction?: boolean
}

export function defaultScrollExperienceContent(): ScrollExperienceContent {
  return {
    mode: 'section',
    scrollDistanceVh: 400,
    startTime: 0,
    smoothing: 'smooth',
    direction: 'forward',
    fit: 'cover',
    mobileFit: 'cover',
    position: 'center',
    overlayOpacity: 0.28,
    overlayStyle: 'gradient',
    backgroundColor: '#0c0c0f',
    heading: 'Your story, paced by every scroll.',
    body: 'Upload a cinematic MP4 to begin.',
    buttonLabel: '',
    buttonHref: '',
    textAlign: 'left',
    contentPosition: 'bottom',
    beats: [],
    showProgressNavigation: false,
    reducedMotionMode: 'poster',
    previewInteraction: true,
  }
}

function finite(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function safeScrollLink(value: unknown) {
  if (typeof value !== 'string') return ''
  const href = value.trim().slice(0, 2_048)
  if (href.startsWith('#') || (href.startsWith('/') && !href.startsWith('//'))) return href
  if (/^(mailto|tel):/i.test(href)) return href
  try {
    const url = new URL(href)
    return ['http:', 'https:'].includes(url.protocol) ? href : ''
  } catch {
    return ''
  }
}

export function normalizeScrollExperienceContent(value: unknown): ScrollExperienceContent {
  const defaults = defaultScrollExperienceContent()
  const raw =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const rawBeats = Array.isArray(raw.beats) ? raw.beats : []
  const beats =
    rawBeats.length > 0
      ? rawBeats.flatMap((beat, index) => {
          if (!beat || typeof beat !== 'object' || Array.isArray(beat)) return []
          const item = beat as Record<string, unknown>
          const count = Math.max(rawBeats.length, 1)
          const start = Math.max(0, Math.min(1, finite(item.startProgress, index / count)))
          const end = Math.max(start, Math.min(1, finite(item.endProgress, (index + 1) / count)))
          return [
            {
              id: typeof item.id === 'string' ? item.id : `beat-${index + 1}`,
              startProgress: start,
              endProgress: end,
              eyebrow: typeof item.eyebrow === 'string' ? item.eyebrow : undefined,
              title: typeof item.title === 'string' ? item.title : undefined,
              body: typeof item.body === 'string' ? item.body : undefined,
              buttonLabel: typeof item.buttonLabel === 'string' ? item.buttonLabel : undefined,
              buttonHref: safeScrollLink(item.buttonHref) || undefined,
              alignment: ['left', 'center', 'right'].includes(String(item.alignment))
                ? (item.alignment as ScrollExperienceBeat['alignment'])
                : 'left',
              position: ['top', 'center', 'bottom'].includes(String(item.position))
                ? (item.position as ScrollExperienceBeat['position'])
                : 'center',
            },
          ]
        })
      : []
  const string = <T extends string>(key: string, choices: readonly T[], fallback: T): T =>
    choices.includes(raw[key] as T) ? (raw[key] as T) : fallback
  return {
    ...defaults,
    cinematic: raw.cinematic,
    experienceId: typeof raw.experienceId === 'string' ? raw.experienceId : undefined,
    experienceVersionId:
      typeof raw.experienceVersionId === 'string' ? raw.experienceVersionId : undefined,
    status: typeof raw.status === 'string' ? raw.status : undefined,
    desktopBytes: finite(raw.desktopBytes, 0) || undefined,
    mobileBytes: finite(raw.mobileBytes, 0) || undefined,
    duration: finite(raw.duration, 0) || undefined,
    posterUrl: typeof raw.posterUrl === 'string' ? raw.posterUrl : undefined,
    mode: string('mode', ['section', 'full_page'] as const, defaults.mode),
    scrollDistanceVh: Math.max(
      150,
      Math.min(1000, finite(raw.scrollDistanceVh, defaults.scrollDistanceVh))
    ),
    startTime: Math.max(0, finite(raw.startTime, 0)),
    endTime: finite(raw.endTime, 0) || undefined,
    smoothing: string('smoothing', ['direct', 'smooth', 'cinematic'] as const, defaults.smoothing),
    direction: string('direction', ['forward', 'reverse'] as const, defaults.direction),
    fit: string('fit', ['cover', 'contain'] as const, defaults.fit),
    mobileFit: string(
      'mobileFit',
      ['cover', 'contain', 'center_crop'] as const,
      defaults.mobileFit
    ),
    position: string('position', ['center', 'top', 'bottom'] as const, defaults.position),
    overlayOpacity: Math.max(0, Math.min(0.9, finite(raw.overlayOpacity, defaults.overlayOpacity))),
    overlayStyle: string(
      'overlayStyle',
      ['solid', 'gradient', 'vignette'] as const,
      defaults.overlayStyle
    ),
    backgroundColor:
      typeof raw.backgroundColor === 'string' ? raw.backgroundColor : defaults.backgroundColor,
    heading: typeof raw.heading === 'string' ? raw.heading : defaults.heading,
    eyebrow: typeof raw.eyebrow === 'string' ? raw.eyebrow : undefined,
    body: typeof raw.body === 'string' ? raw.body : defaults.body,
    buttonLabel: typeof raw.buttonLabel === 'string' ? raw.buttonLabel : '',
    buttonHref: safeScrollLink(raw.buttonHref),
    textAlign: string('textAlign', ['left', 'center', 'right'] as const, defaults.textAlign),
    contentPosition: string(
      'contentPosition',
      ['top', 'center', 'bottom'] as const,
      defaults.contentPosition
    ),
    beats,
    showProgressNavigation: raw.showProgressNavigation === true,
    reducedMotionMode: string(
      'reducedMotionMode',
      ['poster', 'fade', 'none'] as const,
      defaults.reducedMotionMode
    ),
    previewInteraction: raw.previewInteraction !== false,
  }
}
