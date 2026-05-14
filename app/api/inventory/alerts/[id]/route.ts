// app/api/inventory/alerts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getInventoryClient as getSupabaseServerClient } from '@/lib/inventory/supabaseInventory'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import type { AlertStatus } from '@/lib/inventory/types'

type Ctx = { params: Promise<{ id: string }> }

const VALID_STATUSES: AlertStatus[] = ['open', 'acknowledged', 'resolved', 'dismissed']

// ── PATCH /api/inventory/alerts/[id] ──────────────────────────────────────────
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'owner', 'manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { status } = body
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as AlertStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = getSupabaseServerClient()
  const patch: Record<string, unknown> = { status }
  if (status === 'resolved') {
    patch.resolved_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('inventory_alerts')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ alert: data })
}
