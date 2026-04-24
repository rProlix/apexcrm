// app/api/appointments/block/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// ─── GET /api/appointments/block ──────────────────────────────────────────────
// Returns blocked times for the tenant (admin only).
export async function GET(req: NextRequest) {
  const staffUser = await resolveStoreUser(req)
  if (!staffUser || (staffUser.role !== 'admin' && staffUser.role !== 'owner')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseServerClient()
  const params   = req.nextUrl.searchParams
  const from     = params.get('from')
  const to       = params.get('to')

  let query = supabase
    .from('blocked_times')
    .select('*')
    .eq('tenant_id', staffUser.tenant_id)
    .order('start_time', { ascending: true })

  if (from) query = query.gte('start_time', from)
  if (to)   query = query.lte('end_time', to)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ blocks: data })
}

// ─── POST /api/appointments/block ─────────────────────────────────────────────
// Admin creates a blocked time range.
export async function POST(req: NextRequest) {
  const staffUser = await resolveStoreUser(req)
  if (!staffUser || (staffUser.role !== 'admin' && staffUser.role !== 'owner')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { start_time, end_time, reason } = body

  if (typeof start_time !== 'string' || typeof end_time !== 'string') {
    return NextResponse.json({ error: 'start_time and end_time are required' }, { status: 400 })
  }

  if (new Date(start_time) >= new Date(end_time)) {
    return NextResponse.json({ error: 'start_time must be before end_time' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('blocked_times')
    .insert({
      tenant_id:  staffUser.tenant_id,
      start_time,
      end_time,
      reason:     typeof reason === 'string' ? reason.trim() || null : null,
      created_by: staffUser.id,
    })
    .select()
    .single()

  if (error) {
    console.error('[POST /api/appointments/block]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ block: data }, { status: 201 })
}

// ─── DELETE /api/appointments/block ───────────────────────────────────────────
// Admin removes a blocked time by id.
export async function DELETE(req: NextRequest) {
  const staffUser = await resolveStoreUser(req)
  if (!staffUser || (staffUser.role !== 'admin' && staffUser.role !== 'owner')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()

  const { error } = await supabase
    .from('blocked_times')
    .delete()
    .eq('id', id)
    .eq('tenant_id', staffUser.tenant_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
