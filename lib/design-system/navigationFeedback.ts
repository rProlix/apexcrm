export function shouldTrackNavigationHref(href: string, currentHref: string): boolean {
  try {
    const current = new URL(currentHref)
    const destination = new URL(href, current)

    if (!['http:', 'https:'].includes(destination.protocol)) return false
    if (destination.origin !== current.origin) return false

    return destination.pathname !== current.pathname || destination.search !== current.search
  } catch {
    return false
  }
}
