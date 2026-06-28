// lib/website/canva/runs.ts
// SERVER-ONLY. Snapshot-protected Canva import + undo/restore.
//
// A Canva import never destroys the live site:
//   1. Before applying, we snapshot the current DRAFT and the last PUBLISHED
//      version into a website_canva_import_runs row (and a labelled
//      site_versions checkpoint for the normal version history).
//   2. We apply the import to the draft only.
//   3. Undo / restore-pre-import re-applies the before-draft snapshot.
//   4. restore-last-published re-applies the last published snapshot into draft.
// The public site keeps serving the published snapshot until the user publishes.

import 'server-only'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  getCurrentWebsiteSnapshot,
  applySnapshotToWebsiteTables,
  createWebsiteVersion,
} from '@/lib/website/versioning'
import { applyCanvaImport, type ApplyResult } from './apply'
import type { CanvaImportRow, CanvaImportSettings } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any
type Snapshot = Record<string, unknown> | null

async function lastPublishedSnapshot(db: DB, tenantId: string): Promise<Snapshot> {
  try {
    const { data } = await db
      .from('site_versions')
      .select('snapshot, id')
      .eq('tenant_id', tenantId)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data?.snapshot as Snapshot) ?? null
  } catch { return null }
}

/** Restores the canva_* site_settings fields to whatever a snapshot recorded. */
async function restoreCanvaSettingsFromSnapshot(db: DB, tenantId: string, snapshot: Snapshot): Promise<void> {
  const s = ((snapshot?.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>
  try {
    await db.from('site_settings').update({
      canva_import_enabled:         Boolean(s.canva_import_enabled),
      canva_import_id:              (s.canva_import_id as string) ?? null,
      canva_import_mode:            (s.canva_import_mode as string) ?? null,
      canva_source_url:             (s.canva_source_url as string) ?? null,
      canva_embed_code:             (s.canva_embed_code as string) ?? null,
      canva_animation_preservation: (s.canva_animation_preservation as string) ?? null,
    }).eq('tenant_id', tenantId)
  } catch { /* non-fatal */ }
}

/**
 * Applies a Canva import to the draft, wrapped in a traceable run that captures
 * the pre-import draft + last published snapshots so it can be undone.
 */
export async function applyCanvaImportWithRun(params: {
  tenantId: string
  importRow: CanvaImportRow
  settings: CanvaImportSettings
  html?: string | null
  allowCustomDomains?: boolean
  createdBy?: string | null
}): Promise<{ apply: ApplyResult; runId: string | null }> {
  const db = getSupabaseServerClient() as DB
  const { tenantId } = params

  // 1. Capture BEFORE snapshots.
  let beforeDraft: Snapshot = null
  try { beforeDraft = (await getCurrentWebsiteSnapshot(tenantId)).data as Snapshot } catch { /* ignore */ }
  const beforePublished = await lastPublishedSnapshot(db, tenantId)

  // Labelled checkpoint in the normal version history (best-effort).
  try {
    await createWebsiteVersion({
      tenantId,
      label: 'Before Canva import',
      description: 'Auto-saved before applying a Canva import.',
      source: 'manual',
      status: 'autosave',
      createdBy: params.createdBy ?? undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      snapshot: (beforeDraft as any) ?? undefined,
    })
  } catch { /* non-fatal */ }

  // 2. Open the run.
  let runId: string | null = null
  try {
    const { data } = await db.from('website_canva_import_runs').insert({
      tenant_id: tenantId,
      business_id: null,
      website_id: tenantId,
      canva_import_id: params.importRow.id,
      run_type: 'apply',
      status: 'started',
      before_draft_snapshot: beforeDraft,
      before_published_snapshot: beforePublished,
      created_by: params.createdBy ?? null,
    }).select('id').single()
    runId = data?.id ?? null
  } catch { /* non-fatal */ }

  // 3. Apply to draft.
  const apply = await applyCanvaImport({
    tenantId,
    importRow: params.importRow,
    settings: params.settings,
    html: params.html,
    allowCustomDomains: params.allowCustomDomains,
  })

  // 4. Capture AFTER snapshot + close the run.
  let afterDraft: Snapshot = null
  try { afterDraft = (await getCurrentWebsiteSnapshot(tenantId)).data as Snapshot } catch { /* ignore */ }
  if (runId) {
    try {
      await db.from('website_canva_import_runs').update({
        status: apply.ok ? 'completed' : 'failed',
        after_draft_snapshot: afterDraft,
        warnings: apply.warnings,
        completed_at: new Date().toISOString(),
      }).eq('id', runId)
    } catch { /* ignore */ }
  }

  return { apply, runId }
}

export interface RollbackResult {
  ok: boolean
  error?: string
  restored?: 'pre_import_draft' | 'last_published'
  runId?: string | null
}

/**
 * Restores the pre-import draft for the latest completed run (undo) or a
 * specific run. Also reverts the canva_* settings to their pre-import values.
 */
export async function undoCanvaImport(params: {
  tenantId: string
  importId?: string | null
  runId?: string | null
  userId?: string | null
}): Promise<RollbackResult> {
  const db = getSupabaseServerClient() as DB
  const { tenantId } = params

  let run: Record<string, unknown> | null = null
  if (params.runId) {
    const { data } = await db.from('website_canva_import_runs')
      .select('*').eq('id', params.runId).eq('tenant_id', tenantId).maybeSingle()
    run = data ?? null
  } else {
    let q = db.from('website_canva_import_runs').select('*')
      .eq('tenant_id', tenantId).eq('status', 'completed')
    if (params.importId) q = q.eq('canva_import_id', params.importId)
    const { data } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle()
    run = data ?? null
  }

  if (!run) return { ok: false, error: 'No Canva import found to undo.' }
  const beforeDraft = run.before_draft_snapshot as Snapshot
  if (!beforeDraft) return { ok: false, error: 'No pre-import snapshot is available for this import.' }

  const applied = await applySnapshotToWebsiteTables(tenantId, beforeDraft as never, params.userId ?? '')
  if (!applied.data) return { ok: false, error: applied.error ?? 'Could not restore the pre-import draft.' }

  await restoreCanvaSettingsFromSnapshot(db, tenantId, beforeDraft)

  try {
    await db.from('website_canva_import_runs')
      .update({ status: 'undone', completed_at: new Date().toISOString() })
      .eq('id', run.id as string)
  } catch { /* ignore */ }

  return { ok: true, restored: 'pre_import_draft', runId: run.id as string }
}

/**
 * Copies the last published snapshot back into the draft (does NOT publish).
 */
export async function restoreLastPublished(params: {
  tenantId: string
  userId?: string | null
}): Promise<RollbackResult> {
  const db = getSupabaseServerClient() as DB
  const { tenantId } = params

  const snap = await lastPublishedSnapshot(db, tenantId)
  if (!snap) return { ok: false, error: 'No published version found to restore.' }

  const applied = await applySnapshotToWebsiteTables(tenantId, snap as never, params.userId ?? '')
  if (!applied.data) return { ok: false, error: applied.error ?? 'Could not restore the published version.' }

  await restoreCanvaSettingsFromSnapshot(db, tenantId, snap)

  // Trace it as a restore run.
  try {
    await db.from('website_canva_import_runs').insert({
      tenant_id: tenantId, business_id: null, website_id: tenantId,
      run_type: 'restore', status: 'completed',
      before_published_snapshot: snap, after_draft_snapshot: snap,
      created_by: params.userId ?? null, completed_at: new Date().toISOString(),
    })
  } catch { /* ignore */ }

  return { ok: true, restored: 'last_published' }
}

/** Diagnostics helper: latest run + undo availability for a website. */
export async function getCanvaRunDiagnostics(tenantId: string): Promise<{
  latestRunId: string | null
  latestRunStatus: string | null
  hasPreImportSnapshot: boolean
  hasBeforePublishedSnapshot: boolean
  undoAvailable: boolean
}> {
  const db = getSupabaseServerClient() as DB
  try {
    const { data } = await db.from('website_canva_import_runs')
      .select('*').eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!data) {
      return { latestRunId: null, latestRunStatus: null, hasPreImportSnapshot: false, hasBeforePublishedSnapshot: false, undoAvailable: false }
    }
    return {
      latestRunId: data.id as string,
      latestRunStatus: data.status as string,
      hasPreImportSnapshot: !!data.before_draft_snapshot,
      hasBeforePublishedSnapshot: !!data.before_published_snapshot,
      undoAvailable: data.status === 'completed' && !!data.before_draft_snapshot,
    }
  } catch {
    return { latestRunId: null, latestRunStatus: null, hasPreImportSnapshot: false, hasBeforePublishedSnapshot: false, undoAvailable: false }
  }
}
