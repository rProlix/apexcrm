type Cleanup = () => void

let consumers = 0
let dispose: Cleanup | null = null
let initializing: Promise<void> | null = null

export async function acquireCinematicSmoothScroll(
  updateScrollTrigger: () => void
): Promise<Cleanup> {
  consumers++
  if (!dispose) {
    initializing ??= Promise.all([import('lenis'), import('gsap')]).then(
      ([{ default: Lenis }, { gsap }]) => {
        const lenis = new Lenis({ autoRaf: false, duration: 1.05, smoothWheel: true })
        const onScroll = () => updateScrollTrigger()
        const tick = (time: number) => lenis.raf(time * 1000)
        lenis.on('scroll', onScroll)
        gsap.ticker.add(tick)
        gsap.ticker.lagSmoothing(0)
        dispose = () => {
          lenis.off('scroll', onScroll)
          gsap.ticker.remove(tick)
          lenis.destroy()
        }
        initializing = null
      }
    )
    await initializing
  }
  let released = false
  return () => {
    if (released) return
    released = true
    consumers--
    if (consumers === 0) {
      dispose?.()
      dispose = null
    }
  }
}
