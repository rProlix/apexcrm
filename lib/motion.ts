import { MOTION_EASING, MOTION_TRANSITION } from '@/lib/design-system/motion'

export const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: MOTION_TRANSITION.state },
}

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: MOTION_TRANSITION.state },
}

export const slideInLeft = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: MOTION_TRANSITION.overlay },
}

export const slideInRight = {
  hidden: { opacity: 0, x: 12 },
  visible: { opacity: 1, x: 0, transition: MOTION_TRANSITION.overlay },
}

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.985 },
  visible: { opacity: 1, scale: 1, transition: MOTION_TRANSITION.overlay },
}

export const staggerContainer = (staggerChildren = 0.07, delayChildren = 0) => ({
  hidden: {},
  visible: {
    transition: {
      staggerChildren: Math.min(staggerChildren, 0.06),
      delayChildren: Math.min(delayChildren, 0.12),
    },
  },
})

export const cardHover = {
  rest: { scale: 1, y: 0, transition: MOTION_TRANSITION.feedback },
  hover: { scale: 1.006, y: -1, transition: MOTION_TRANSITION.feedback },
}

export const sidebarItemHover = {
  rest: { x: 0, transition: MOTION_TRANSITION.feedback },
  hover: { x: 1, transition: MOTION_TRANSITION.feedback },
}

export { MOTION_EASING, MOTION_TRANSITION }
