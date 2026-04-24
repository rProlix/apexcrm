// lib/domain/normalizeHost.ts
// Strips protocol, path, query string, and port from any host/URL string.
// Returns a clean, lowercase hostname suitable for DB lookups and comparisons.

/**
 * Normalizes a host string to a bare lowercase hostname with no port.
 *
 * Examples:
 *   "https://www.example.com:3000/path?q=1" → "www.example.com"
 *   "RENTALCO.yourcrm.com:443"              → "rentalco.yourcrm.com"
 *   "localhost:3000"                         → "localhost"
 */
export function normalizeHost(host: string): string {
  if (!host) return ''

  let h = host.trim().toLowerCase()

  // Strip protocol
  h = h.replace(/^https?:\/\//, '')

  // Strip path, query, and fragment
  h = h.split('/')[0].split('?')[0].split('#')[0]

  // Strip port
  h = h.split(':')[0]

  return h
}

/**
 * Returns true if the hostname looks like a valid public hostname
 * (not an IP address, not localhost, not an internal host).
 */
export function isPublicHostname(host: string): boolean {
  const h = normalizeHost(host)
  if (!h) return false

  // Block bare hostnames with no TLD
  if (!h.includes('.')) return false

  // Block localhost variants
  if (h === 'localhost' || h.endsWith('.localhost')) return false

  // Block private IPv4 ranges
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.)/.test(h)) return false

  // Block IPv6 loopback / link-local
  if (h === '::1' || h.startsWith('fe80:')) return false

  // Block cloud metadata IPs
  if (h === '169.254.169.254' || h === '100.100.100.200') return false

  // Block numeric IP addresses
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false

  return true
}

/**
 * Returns true if the string is a valid DNS hostname (FQDN rules).
 */
export function isValidDomain(host: string): boolean {
  const h = normalizeHost(host)
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(h)
}
