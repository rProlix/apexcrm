// app/api/product-360/queue/route.ts
//
// GET /api/product-360/queue
//
// Returns a tenant-scoped queue overview: status counts + package summaries.
//
// Products are fetched separately (not embedded) to avoid the PostgREST
// ambiguous-relationship error that occurs when using embedded syntax between
// product_360_packages and products (two FK paths exist).
//
// Response:
//   { ok: true, data: { counts, packages } }
//   { ok: false, error: { type, title, message } }

import { NextRequest, NextResponse }  from 'next/server'
import { resolveP360ApiUser }         from '@/lib/product-360/auth'
import { getSupabaseServerClient }    from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// A package is stale if it's been generating/queued without a DB update for this long.
const STALE_THRESHOLD_MS = 10 * 60 * 1000  // 10 minutes

export async function GET(req: NextRequest) {
  const user = await resolveP360ApiUser(req)
  if (!user) {
    return NextResponse.json({
      ok: false, error: { type: 'auth_error', title: 'Unauthorized', message: 'Authentication required.' },
    }, { status: 401 })
  }
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({
      ok: false, error: { type: 'forbidden', title: 'Forbidden', message: 'Only owners and admins can view the queue.' },
    }, { status: 403 })
  }

  const tenantId = user.isOwner
    ? (req.nextUrl.searchParams.get('tenantId') ?? user.tenantId)
    : user.tenantId

  if (!tenantId) {
    return NextResponse.json({
      ok: false, error: { type: 'invalid_request', title: 'Missing tenant', message: 'Could not resolve tenant.' },
    }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // ── Load all packages (all statuses) ────────────────────────────────────────
  const { data: pkgRows, error: pkgErr } = await db
    .from('product_360_packages')
    .select([
      'id', 'tenant_id', 'product_id', 'name', 'status',
      'is_enabled', 'is_primary', 'is_default',
      'frames_done', 'frame_count', 'target_frame_count', 'progress_percent',
      'queue_position', 'queued_at',
      'created_at', 'updated_at',
      'cancel_requested', 'last_error_message', 'archived_at',
      'generation_started_at', 'generation_completed_at',
    ].join(', '))
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (pkgErr) {
    return NextResponse.json({
      ok: false, error: { type: 'internal', title: 'Database error', message: pkgErr.message },
    }, { status: 500 })
  }

  const packages = (pkgRows ?? []) as Record<string, unknown>[]

  // ── Load product names separately (safe — avoids FK ambiguity) ──────────────
  const productIds = [...new Set(packages.map(p => p.product_id as string).filter(Boolean))]
  const productNameMap: Record<string, string> = {}

  if (productIds.length > 0) {
    const { data: prodRows } = await db
      .from('products')
      .select('id, name')
      .in('id', productIds)

    for (const r of (prodRows ?? []) as { id: string; name: string }[]) {
      productNameMap[r.id] = r.name
    }
  }

  // ── Load frame counts per package ─────────────────────────────────────────
  const pkgIds = packages.map(p => p.id as string)
  const frameCountMap: Record<string, { total: number; completed: number; failed: number; pending: number }> = {}

  if (pkgIds.length > 0) {
    const { data: frameRows } = await db
      .from('product_360_frames')
      .select('package_id, image_url, error_type')
      .in('package_id', pkgIds)

    for (const f of (frameRows ?? []) as Record<string, unknown>[]) {
      const pid = f.package_id as string
      if (!frameCountMap[pid]) frameCountMap[pid] = { total: 0, completed: 0, failed: 0, pending: 0 }
      frameCountMap[pid].total++
      if (f.image_url)  frameCountMap[pid].completed++
      else if (f.error_type) frameCountMap[pid].failed++
      else frameCountMap[pid].pending++
    }
  }

  // ── Build status counts ───────────────────────────────────────────────────
  const counts: Record<string, number> = {
    draft: 0, queued: 0, planning: 0, generating: 0, processing: 0,
    paused_quota: 0, ready: 0, completed: 0, failed: 0, cancelled: 0, archived: 0,
  }
  for (const p of packages) {
    const st = (p.status as string) ?? 'draft'
    counts[st] = (counts[st] ?? 0) + 1
  }

  // ── Build response packages ────────────────────────────────────────────────
  const now = Date.now()
  const ACTIVE = new Set(['queued', 'planning', 'generating', 'processing'])

  const responsePackages = packages.map(p => {
    const st        = p.status as string
    const updatedAt = p.updated_at as string
    const msSince   = now - new Date(updatedAt).getTime()
    const isStale   = ACTIVE.has(st) && msSince > STALE_THRESHOLD_MS
    const fc        = frameCountMap[p.id as string] ?? { total: 0, completed: 0, failed: 0, pending: 0 }
    const target    = (p.target_frame_count as number) || (p.frame_count as number) || 0
    const done      = Math.max((p.frames_done as number) ?? 0, fc.completed)
    const pct       = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : (p.progress_percent as number) ?? 0

    return {
      id:               p.id,
      tenant_id:        p.tenant_id,
      product_id:       p.product_id ?? null,
      product_name:     p.product_id ? (productNameMap[p.product_id as string] ?? null) : null,
      package_name:     p.name,
      status:           st,
      is_enabled:       p.is_enabled ?? false,
      is_primary:       p.is_primary || p.is_default || false,
      queue_position:   p.queue_position ?? null,
      queued_at:        p.queued_at ?? null,
      frames_total:     target,
      frames_completed: done,
      frames_failed:    fc.failed,
      frames_pending:   fc.pending,
      progress_percent: pct,
      is_stale:         isStale,
      last_error_message: p.last_error_message ?? null,
      archived_at:      p.archived_at ?? null,
      generation_started_at:   p.generation_started_at ?? null,
      generation_completed_at: p.generation_completed_at ?? null,
      created_at:       p.created_at,
      updated_at:       updatedAt,
    }
  })

  return NextResponse.json({
    ok: true,
    data: { counts, packages: responsePackages },
  })
}
