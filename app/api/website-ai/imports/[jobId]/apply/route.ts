// app/api/website-ai/imports/[jobId]/apply/route.ts
// POST /api/website-ai/imports/[jobId]/apply
// Applies selected suggestions to the Website Builder.
// After applying, saves draft snapshot so version checkpoints stay accurate.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireAiAutofillAccess, verifyJobAccess } from '@/lib/website-ai/tenantAccess'
import { applyWebsiteSuggestions } from '@/lib/website-ai/applyWebsiteSuggestions'
import { getCurrentWebsiteSnapshot, updateDraftSnapshot } from '@/lib/website/versioning'
import { normalizeSnapshotForInsert } from '@/lib/website/snapshot/safeJson'
import type { PublishMode } from '@/lib/website-ai/types'

type Params = { params: Promise<{ jobId: string }> }

function forbidden(msg = 'Forbidden') {
  return NextResponse.json({ error: msg }, { status: 403 })
}

const VALID_PUBLISH_MODES = new Set<PublishMode>(['draft_only', 'publish_now'])

export async function POST(req: NextRequest, { params }: Params) {
  const { jobId } = await params

  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return forbidden('You do not have permission to use AI Autofill for this website.')

  const access = await requireAiAutofillAccess()
  if (!access) return forbidden('You do not have permission to use AI Autofill for this website.')
  const { tenantId } = access

  if (!(await verifyJobAccess(jobId, tenantId))) {
    return NextResponse.json({ error: 'This import does not belong to your business.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const suggestionIds = Array.isArray(body.suggestionIds)
    ? (body.suggestionIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : []

  const publishMode: PublishMode = VALID_PUBLISH_MODES.has(body.publishMode as PublishMode)
    ? (body.publishMode as PublishMode)
    : 'draft_only'

  if (suggestionIds.length === 0) {
    return NextResponse.json({ error: 'No suggestion IDs provided' }, { status: 422 })
  }

  const db = getSupabaseServerClient()

  // Load the job
  const { data: job } = await db
    .from('website_ai_import_jobs')
    .select('status')
    .eq('id', jobId)
    .eq('tenant_id', tenantId)
    .single()

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (job.status === 'failed' || job.status === 'cancelled') {
    return NextResponse.json({ error: `Cannot apply a ${job.status} job.` }, { status: 409 })
  }

  // Load the selected suggestions
  const { data: suggestions, error: sugErr } = await db
    .from('website_ai_suggestions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('job_id', jobId)
    .in('id', suggestionIds)

  if (sugErr) return NextResponse.json({ error: sugErr.message }, { status: 500 })
  if (!suggestions?.length) {
    return NextResponse.json({ error: 'No matching suggestions found' }, { status: 404 })
  }

  // Save "before AI autofill" version — non-blocking, never block on failure
  saveVersionQuietly({
    tenantId,
    userId: ctx.id,
    label: 'Before AI Autofill',
    description: `Auto-saved before applying AI autofill (job ${jobId})`,
    source: 'manual',
    status: 'autosave',
  })

  // Load the job's full result to get the design system from Gemini
  const { data: jobFull } = await db
    .from('website_ai_import_jobs')
    .select('metadata, detected_business_type')
    .eq('id', jobId)
    .eq('tenant_id', tenantId)
    .single()

  const rawDesignSystem = (jobFull?.metadata as Record<string, unknown>)?.designSystem as Record<string, unknown> | undefined
  const detectedBusinessType = (jobFull as Record<string, unknown> | null)?.detected_business_type as string | undefined

  // Apply suggestions to DB
  const result = await applyWebsiteSuggestions(
    suggestions as Parameters<typeof applyWebsiteSuggestions>[0],
    {
      tenantId,
      jobId,
      appliedBy:   ctx.auth_id,
      publishMode,
      rawDesignSystem,
      detectedBusinessType,
    }
  )

  // After AI autofill updates DB — refresh draft snapshot so checkpoints are accurate
  if (result.applied > 0) {
    try {
      const snapResult = await getCurrentWebsiteSnapshot(tenantId)
      if (snapResult.data) {
        const normalized = normalizeSnapshotForInsert(snapResult.data) as unknown as Parameters<typeof updateDraftSnapshot>[1]
        await updateDraftSnapshot(tenantId, normalized, ctx.id ?? '')
      }
    } catch (e) {
      console.warn('[ai-autofill] Failed to update draft snapshot after apply:', e instanceof Error ? e.message : e)
    }

    // Save "after AI autofill" version — non-blocking
    saveVersionQuietly({
      tenantId,
      userId: ctx.id,
      label: 'AI Autofill Applied',
      description: `AI autofill applied ${result.applied} change(s) (job ${jobId})`,
      source: 'ai_autofill',
      status: 'draft',
    })
  }

  // Persist applied_changes rows
  if (result.changes.length > 0) {
    const changeRows = result.changes.map((c) => ({
      tenant_id:       c.tenant_id,
      job_id:          c.job_id,
      suggestion_id:   c.suggestion_id,
      applied_by:      c.applied_by,
      target_type:     c.target_type,
      target_id:       c.target_id,
      before_snapshot: c.before_snapshot,
      after_snapshot:  c.after_snapshot,
    }))
    await db.from('website_ai_applied_changes').insert(changeRows as never)
  }

  // Mark job as applied if all pending suggestions are done
  const { data: remaining } = await db
    .from('website_ai_suggestions')
    .select('id')
    .eq('job_id', jobId)
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'accepted', 'edited'])

  if (!remaining?.length && result.applied > 0) {
    await db
      .from('website_ai_import_jobs')
      .update({ status: 'applied' })
      .eq('id', jobId)
  }

  return NextResponse.json({
    applied:   result.applied,
    skipped:   result.skipped,
    errors:    result.errors,
    published: publishMode === 'publish_now',
    draftSaved: result.applied > 0,
  })
}

// Inserts a version without blocking the main response
function saveVersionQuietly(opts: {
  tenantId: string
  userId: string | undefined
  label: string
  description: string
  source: string
  status: string
}) {
  Promise.resolve()
    .then(async () => {
      const { createWebsiteVersion } = await import('@/lib/website/versioning')
      await createWebsiteVersion({
        tenantId:    opts.tenantId,
        label:       opts.label,
        description: opts.description,
        source:      opts.source as Parameters<typeof createWebsiteVersion>[0]['source'],
        status:      opts.status as Parameters<typeof createWebsiteVersion>[0]['status'],
        createdBy:   opts.userId,
      })
    })
    .catch((e: unknown) =>
      console.warn('[ai-autofill] Background version save failed (non-fatal):', e instanceof Error ? e.message : e)
    )
}
