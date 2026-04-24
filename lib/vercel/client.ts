// lib/vercel/client.ts
// Vercel API HTTP client. Server-side ONLY — never import this in client components.
// Reads credentials from environment variables; never exposes them to the browser.

export const VERCEL_API = 'https://api.vercel.com'

const VERCEL_TOKEN      = process.env.VERCEL_TOKEN
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID
const VERCEL_TEAM_ID    = process.env.VERCEL_TEAM_ID

export function isVercelConfigured(): boolean {
  return Boolean(VERCEL_TOKEN && VERCEL_PROJECT_ID)
}

function buildUrl(path: string): string {
  const url = new URL(`${VERCEL_API}${path}`)
  if (VERCEL_TEAM_ID) url.searchParams.set('teamId', VERCEL_TEAM_ID)
  return url.toString()
}

async function vercelFetch<T>(
  path:    string,
  options: RequestInit = {},
): Promise<{ data: T | null; error: string | null }> {
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    return { data: null, error: 'Vercel is not configured (missing VERCEL_TOKEN or VERCEL_PROJECT_ID)' }
  }

  try {
    const res = await fetch(buildUrl(path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${VERCEL_TOKEN}`,
        ...options.headers,
      },
    })

    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      const msg = (json as { error?: { message?: string } }).error?.message
        ?? `Vercel API error ${res.status}`
      return { data: null, error: msg }
    }

    return { data: json as T, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Network error' }
  }
}

export const vercelClient = {
  get:    <T>(path: string)                       => vercelFetch<T>(path, { method: 'GET' }),
  post:   <T>(path: string, body: unknown)        => vercelFetch<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  delete: <T>(path: string)                       => vercelFetch<T>(path, { method: 'DELETE' }),
  patch:  <T>(path: string, body: unknown)        => vercelFetch<T>(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  projectId: VERCEL_PROJECT_ID,
}
