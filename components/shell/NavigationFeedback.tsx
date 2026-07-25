'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { shouldTrackNavigationHref } from '@/lib/design-system/navigationFeedback'

const FEEDBACK_TIMEOUT_MS = 10_000

export function NavigationFeedback() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeKey = `${pathname}?${searchParams.toString()}`
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    setIsPending(false)
  }, [routeKey])

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }

      if (!(event.target instanceof Element)) return

      const link = event.target.closest<HTMLAnchorElement>('a[href]')
      if (
        !link ||
        link.hasAttribute('download') ||
        (link.target && link.target !== '_self') ||
        link.dataset.navigationFeedback === 'off'
      ) {
        return
      }

      if (shouldTrackNavigationHref(link.href, window.location.href)) {
        setIsPending(true)
      }
    }

    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [])

  useEffect(() => {
    if (!isPending) return

    const timeout = window.setTimeout(() => setIsPending(false), FEEDBACK_TIMEOUT_MS)
    return () => window.clearTimeout(timeout)
  }, [isPending])

  if (!isPending) return null

  return (
    <div
      className="ui-navigation-progress"
      role="progressbar"
      aria-label="Loading next page"
      aria-valuetext="Loading"
    >
      <span className="ui-navigation-progress-bar" />
    </div>
  )
}
