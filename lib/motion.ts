// Shared Framer Motion animation variants for consistent premium feel

export const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

export const fadeIn = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25, ease: 'easeOut' } },
}

export const slideInLeft = {
  hidden:  { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

export const slideInRight = {
  hidden:  { opacity: 0, x: 16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

export const scaleIn = {
  hidden:  { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.25, ease: 'easeOut' } },
}

/** Staggered container — children animate in sequence */
export const staggerContainer = (staggerChildren = 0.07, delayChildren = 0) => ({
  hidden:  {},
  visible: {
    transition: { staggerChildren, delayChildren },
  },
})

/** Card hover — subtle lift */
export const cardHover = {
  rest: { scale: 1,    y: 0,  transition: { duration: 0.2, ease: 'easeOut' } },
  hover:{ scale: 1.01, y: -2, transition: { duration: 0.2, ease: 'easeOut' } },
}

/** Sidebar item hover */
export const sidebarItemHover = {
  rest: { x: 0,   transition: { duration: 0.15 } },
  hover:{ x: 2,   transition: { duration: 0.15 } },
}

/** Gold shimmer for live indicators */
export const goldPulse = {
  animate: {
    opacity: [1, 0.45, 1],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
  },
}
