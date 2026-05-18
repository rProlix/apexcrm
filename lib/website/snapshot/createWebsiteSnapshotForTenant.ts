// lib/website/snapshot/createWebsiteSnapshotForTenant.ts
//
// Canonical server-side function for creating a WebsiteSnapshot.
//
// Priority order:
//   1. Client-submitted snapshot (if preferClientSnapshot = true and it's valid)
//   2. Current draft from website_builder_drafts (if dirty)
//   3. Live website tables (getCurrentWebsiteSnapshot fallback)
//
// Always returns a normalized, JSON-safe snapshot or a structured error.
// Never throws.

import { getCurrentWebsiteSnapshot, getDraftSnapshot } from '@/lib/website/versioning'
import { normalizeSnapshotForInsert, asArray, asRecord, estimateKb } from './safeJson'
import type { WebsiteSnapshot, ClientPageSections } from '@/lib/website/versionTypes'

type SnapshotSuccess = {
  ok:           true
  snapshot:     WebsiteSnapshot
  pageCount:    number
  sectionCount: number
  estimatedKb:  number
  fromClient:   boolean
  warnings:     string[]
}

type SnapshotFailure = {
  ok:      false
  error:   string
  details: string
  step:    string
}

export type SnapshotResult = SnapshotSuccess | SnapshotFailure

export async function createWebsiteSnapshotForTenant(params: {
  tenantId:            string
  userId?:             string | null
  source?:             string
  clientSnapshot?:     unknown
  clientPageSections?: ClientPageSections
  preferClientSnapshot?: boolean
  /**
   * When true, skip the dirty website_builder_drafts snapshot and always read
   * from live site_sections / site_pages. Use this on publish to ensure recent
   * PATCH edits to site_sections are captured (not overridden by a stale draft).
   */
  forPublish?:         boolean
}): Promise<SnapshotResult> {
  const {
    tenantId,
    clientSnapshot,
    clientPageSections,
    preferClientSnapshot = false,
    forPublish           = false,
  } = params

  const warnings: string[] = []

  // ── Path A: Validate and use client-submitted snapshot ─────────────────────
  if (preferClientSnapshot && clientSnapshot) {
    const validated = tryValidateClientSnapshot(clientSnapshot, tenantId, warnings)
    if (validated.ok) {
      const normalized = normalizeSnapshotForInsert(validated.snapshot) as unknown as WebsiteSnapshot
      const pageCount    = normalized.pages?.length ?? 0
      const sectionCount = (normalized.pages ?? []).reduce((s, p) => s + (p.sections?.length ?? 0), 0)
      return {
        ok:          true,
        snapshot:    normalized,
        pageCount,
        sectionCount,
        estimatedKb: estimateKb(normalized),
        fromClient:  true,
        warnings,
      }
    }
    warnings.push(`Client snapshot invalid: ${validated.reason} — falling back to server data`)
  }

  // ── Path B: Live tables snapshot (with optional client page override) ────────
  let serverSnapshot: WebsiteSnapshot | null = null

  // If we have clientPageSections, build from live tables with that override
  if (clientPageSections?.pageId && Array.isArray(clientPageSections.sections)) {
    const result = await getCurrentWebsiteSnapshot(tenantId, clientPageSections)
    if (result.data) {
      serverSnapshot = result.data
    } else {
      warnings.push(`getCurrentWebsiteSnapshot with client override failed: ${result.error}`)
    }
  }

  // Try dirty draft snapshot ONLY when not publishing.
  // When forPublish=true, always read from live site_sections so that recent
  // PATCH edits (e.g. from AI restyle / template apply / builder edits) are
  // captured — a stale website_builder_drafts row would override them otherwise.
  if (!serverSnapshot && !forPublish) {
    const draftResult = await getDraftSnapshot(tenantId)
    if (draftResult.data?.pages?.length) {
      serverSnapshot = draftResult.data
    } else if (draftResult.error) {
      warnings.push(`getDraftSnapshot failed: ${draftResult.error}`)
    }
  }

  // Always read from live tables on publish (and as fallback otherwise)
  if (!serverSnapshot) {
    const liveResult = await getCurrentWebsiteSnapshot(tenantId)
    if (liveResult.data) {
      serverSnapshot = liveResult.data
      if (forPublish && process.env.NODE_ENV === 'development') {
        const sectionCount = liveResult.data.pages.reduce((s, p) => s + p.sections.length, 0)
        console.info(`[snapshot] forPublish=true — reading ${sectionCount} sections from live tables`)
      }
    } else {
      return {
        ok:      false,
        error:   'Could not build website snapshot',
        details: liveResult.error ?? 'getCurrentWebsiteSnapshot returned no data',
        step:    'snapshot_create',
      }
    }
  }

  const normalized = normalizeSnapshotForInsert(serverSnapshot) as unknown as WebsiteSnapshot
  const pageCount    = normalized.pages?.length ?? 0
  const sectionCount = (normalized.pages ?? []).reduce((s, p) => s + (p.sections?.length ?? 0), 0)

  if (pageCount === 0) {
    warnings.push('Snapshot has 0 pages — website may have no content yet')
  }
  if (sectionCount === 0) {
    warnings.push('Snapshot has 0 sections — check that site_sections is populated')
  }

  return {
    ok:          true,
    snapshot:    normalized,
    pageCount,
    sectionCount,
    estimatedKb: estimateKb(normalized),
    fromClient:  false,
    warnings,
  }
}

// ── Internal: validate a client-submitted snapshot object ─────────────────────

function tryValidateClientSnapshot(
  raw: unknown,
  tenantId: string,
  warnings: string[],
): { ok: true; snapshot: WebsiteSnapshot } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'not an object' }
  }

  const obj = raw as Record<string, unknown>

  if (obj.schemaVersion !== 1) {
    return { ok: false, reason: `schemaVersion must be 1, got ${obj.schemaVersion}` }
  }

  if (!obj.tenantId) {
    // Allow missing tenantId — we'll inject it
    warnings.push('Client snapshot missing tenantId — injecting server tenantId')
    obj.tenantId = tenantId
  } else if (obj.tenantId !== tenantId) {
    return { ok: false, reason: `tenant mismatch: snapshot has ${obj.tenantId}, expected ${tenantId}` }
  }

  if (!Array.isArray(obj.pages)) {
    return { ok: false, reason: 'pages must be an array' }
  }

  // Normalize pages and sections defensively
  const pages = asArray(obj.pages).map((page: unknown) => {
    const p = asRecord(page)
    return {
      ...p,
      sections: asArray(p.sections).map((sec: unknown) => {
        const s = asRecord(sec)
        return {
          ...s,
          content:          asRecord(s.content),
          style_config:     s.style_config ? asRecord(s.style_config) : null,
          animation_config: s.animation_config ? asRecord(s.animation_config) : null,
          is_visible:       s.is_visible !== false,
          sort_order:       typeof s.sort_order === 'number' ? s.sort_order : 0,
        }
      }),
    }
  })

  const snapshot: WebsiteSnapshot = {
    schemaVersion: 1,
    tenantId,
    capturedAt:    typeof obj.capturedAt === 'string' ? obj.capturedAt : new Date().toISOString(),
    source:        typeof obj.source === 'string' ? (obj.source as WebsiteSnapshot['source']) : 'manual',
    settings:      asRecord(obj.settings),
    navigation:    asArray(obj.navigation),
    pages:         pages as WebsiteSnapshot['pages'],
  }

  return { ok: true, snapshot }
}
