// app/api/professionals/route.ts
// GET  — list active professionals for the tenant
// POST — create a new professional
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'

function ok(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}
function err(message: string, code: string, status: number, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, code, details }, { status })
}

// ─── GET /api/professionals ───────────────────────────────────────────────────
// Admin/owner: returns all professionals for their tenant.
// Customers: returns active professionals only (for booking UI).
export async function GET(req: NextRequest) {
  const params     = req.nextUrl.searchParams
  const activeOnly = params.get('active') !== 'false'

  let tenant_id: string | null = null

  const staffUser = await resolveStoreUser(req)
  if (staffUser && (staffUser.role === 'admin' || staffUser.role === 'owner')) {
    tenant_id = staffUser.tenant_id
  }

  if (!tenant_id) {
    const customerUser = await resolveStoreCustomer(req)
    if (customerUser) {
      tenant_id = customerUser.tenant_id
    }
  }

  if (!tenant_id) {
    return err('Unauthorized', 'UNAUTHORIZED', 401)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any
  let query = supabase
    .from('professionals')
    .select('id, tenant_id, name, email, phone, role, avatar_url, is_active, created_at, updated_at')
    .eq('tenant_id', tenant_id)
    .order('name', { ascending: true })

  if (activeOnly) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/professionals]', error.message)
    return err(error.message, 'DB_ERROR', 500)
  }

  return ok({ professionals: data ?? [] })
}

// ─── POST /api/professionals ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const staffUser = await resolveStoreUser(req)
  if (!staffUser || (staffUser.role !== 'admin' && staffUser.role !== 'owner')) {
    return err('Unauthorized', 'UNAUTHORIZED', 401)
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return err('Invalid JSON body', 'INVALID_JSON', 400)
  }

  const { name, email, phone, role, avatar_url, is_active } = body

  if (typeof name !== 'string' || !name.trim()) {
    return err('name is required', 'VALIDATION_ERROR', 400)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any
  const { data, error } = await supabase
    .from('professionals')
    .insert({
      tenant_id:  staffUser.tenant_id,
      name:       name.trim(),
      email:      typeof email      === 'string' ? email.trim()  : null,
      phone:      typeof phone      === 'string' ? phone.trim()  : null,
      role:       typeof role       === 'string' ? role.trim()   : 'staff',
      avatar_url: typeof avatar_url === 'string' ? avatar_url    : null,
      is_active:  is_active !== false,
    })
    .select('id, tenant_id, name, email, phone, role, avatar_url, is_active, created_at, updated_at')
    .single()

  if (error) {
    console.error('[POST /api/professionals]', error.message)
    return err(error.message, 'DB_ERROR', 500)
  }

  return ok({ professional: data }, 201)
}
