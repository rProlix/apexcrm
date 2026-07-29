'use client'

import { useEffect } from 'react'

type ScrollLockTarget = {
  body: {
    style: {
      overflow: string
      paddingRight: string
    }
  }
  documentElement: {
    clientWidth: number
  }
  viewportWidth: number
}

export function createBodyScrollLockManager(getTarget: () => ScrollLockTarget | null) {
  const locks = new Set<symbol>()
  let originalOverflow = ''
  let originalPaddingRight = ''

  function acquire() {
    const target = getTarget()
    if (!target) return () => undefined

    const token = Symbol('body-scroll-lock')
    if (locks.size === 0) {
      originalOverflow = target.body.style.overflow
      originalPaddingRight = target.body.style.paddingRight
      const scrollbarWidth = Math.max(0, target.viewportWidth - target.documentElement.clientWidth)

      target.body.style.overflow = 'hidden'
      if (scrollbarWidth > 0) {
        target.body.style.paddingRight = `${scrollbarWidth}px`
      }
    }
    locks.add(token)

    let released = false
    return () => {
      if (released) return
      released = true
      locks.delete(token)
      if (locks.size > 0) return

      const currentTarget = getTarget()
      if (!currentTarget) return
      currentTarget.body.style.overflow = originalOverflow
      currentTarget.body.style.paddingRight = originalPaddingRight
    }
  }

  return {
    acquire,
    get activeCount() {
      return locks.size
    },
  }
}

const bodyScrollLock = createBodyScrollLockManager(() => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null
  return {
    body: document.body,
    documentElement: document.documentElement,
    viewportWidth: window.innerWidth,
  }
})

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    return bodyScrollLock.acquire()
  }, [active])
}
