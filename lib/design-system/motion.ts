export const MOTION_DURATION_MS = {
  instant: 0,
  feedback: 120,
  state: 180,
  overlay: 240,
  layout: 280,
} as const

export const MOTION_DURATION_SECONDS = {
  instant: 0,
  feedback: MOTION_DURATION_MS.feedback / 1000,
  state: MOTION_DURATION_MS.state / 1000,
  overlay: MOTION_DURATION_MS.overlay / 1000,
  layout: MOTION_DURATION_MS.layout / 1000,
} as const

export const MOTION_EASING = {
  enter: [0.16, 1, 0.3, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
  cssEnter: 'cubic-bezier(0.16, 1, 0.3, 1)',
  cssExit: 'cubic-bezier(0.4, 0, 1, 1)',
} as const

export const MOTION_TRANSITION = {
  feedback: {
    duration: MOTION_DURATION_SECONDS.feedback,
    ease: MOTION_EASING.enter,
  },
  state: {
    duration: MOTION_DURATION_SECONDS.state,
    ease: MOTION_EASING.enter,
  },
  overlay: {
    duration: MOTION_DURATION_SECONDS.overlay,
    ease: MOTION_EASING.enter,
  },
  layout: {
    duration: MOTION_DURATION_SECONDS.layout,
    ease: MOTION_EASING.enter,
  },
  exit: {
    duration: MOTION_DURATION_SECONDS.state,
    ease: MOTION_EASING.exit,
  },
} as const

export const MOTION_LAYER = {
  base: 0,
  sticky: 20,
  drawer: 40,
  popover: 50,
  modal: 60,
  toast: 70,
} as const

export function getOverlayTransformOrigin(
  trigger: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  overlay: Pick<DOMRect, 'left' | 'top'>
): string {
  const x = trigger.left + trigger.width / 2 - overlay.left
  const y = trigger.top + trigger.height / 2 - overlay.top
  return `${Math.round(x)}px ${Math.round(y)}px`
}
