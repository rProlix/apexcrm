'use client'

// lib/builder/versionsApi.ts — Client-side API helpers for website versioning

import type { WebsiteVersionSummary, WebsiteVersionSource, ClientPageSections } from '@/lib/website/versionTypes'

export async function fetchVersions(): Promise<WebsiteVersionSummary[]> {
  const res = await fetch('/api/website/versions')
  if (!res.ok) return []
  const json = await res.json()
  return (json.versions ?? []) as WebsiteVersionSummary[]
}

/**
 * Create a version checkpoint.
 *
 * If clientPageSections is provided it is sent to the API so the checkpoint
 * captures unsaved content edits still in the auto-save debounce window.
 */
export async function createVersionCheckpoint(
  label?: string,
  source: WebsiteVersionSource = 'manual',
  clientPageSections?: ClientPageSections,
): Promise<WebsiteVersionSummary | null> {
  const body: Record<string, unknown> = {
    label:  label ?? 'Manual checkpoint',
    source,
  }
  if (clientPageSections) {
    body.clientPageSections = clientPageSections
  }

  const res = await fetch('/api/website/versions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('[versionsApi] createVersionCheckpoint failed', err)
    return null
  }
  const json = await res.json()
  return (json.version ?? null) as WebsiteVersionSummary | null
}

export async function restoreVersion(versionId: string): Promise<boolean> {
  const res = await fetch(`/api/website/versions/${versionId}/restore`, {
    method: 'POST',
  })
  return res.ok
}

export async function publishVersion(versionId: string): Promise<boolean> {
  const res = await fetch(`/api/website/versions/${versionId}/publish`, {
    method: 'POST',
  })
  return res.ok
}

export async function renameVersion(versionId: string, label: string): Promise<boolean> {
  const res = await fetch(`/api/website/versions/${versionId}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ label }),
  })
  return res.ok
}

export async function triggerAutosave(): Promise<boolean> {
  const res = await fetch('/api/website/versions/autosave', { method: 'POST' })
  return res.ok
}

export async function moveSectionDirection(
  sectionId: string,
  direction: 'up' | 'down',
): Promise<boolean> {
  const res = await fetch('/api/website/sections/move', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ sectionId, direction }),
  })
  return res.ok
}
