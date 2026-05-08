// app/api/professionals/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'

type Ctx = { params: Promise<{ id: string }> }

function ok(data: unknown) {
  return NextResponse.json({ ok: true, data })
}
function err(message: string, code: string, status: number) {
  return NextResponse.json({ ok: false, error: message, code }, { status })
}

function requireAdmin(staffUser: Awaited<ReturnType<typeof resolveStoreUser>>) {
  return !staffUser || (staffUser.role !== 'admin' && staffUser.role !== 'owner')
}

// ─── PATCH /api/professionals/[id] ───────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const staffUser = await resolveStoreUser(req)
  if (requireAdmin(staffUser)) return err('Unauthorized', 'UNAUTHORIZED', 401)

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return err('Invalid JSON body', 'INVALID_JSON', 400)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase  = getSupabaseServerClient() as any
  const tenant_id = staffUser!.tenant_id

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name       !== undefined) patch.name       = String(body.name).trim()
  if (body.email      !== undefined) patch.email      = body.email ? String(body.email).trim() : null
  if (body.phone      !== undefined) patch.phone      = body.phone ? String(body.phone).trim() : null
  if (body.role       !== undefined) patch.role       = String(body.role).trim()
  if (body.avatar_url !== undefined) patch.avatar_url = body.avatar_url ? String(body.avatar_url) : null
  if (body.is_active  !== undefined) patch.is_active  = Boolean(body.is_active)

  if (patch.name === '') return err('name cannot be empty', 'VALIDATION_ERROR', 400)

  const { data, error } = await supabase
    .from('professionals')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenant_id)
    .select('id, tenant_id, name, email, phone, role, avatar_url, is_active, created_at, updated_at')
    .single()

  if (error) {
    console.error('[PATCH /api/professionals/[id]]', error.message)
    return err(error.message, 'DB_ERROR', 500)
  }
  if (!data) return err('Not found', 'NOT_FOUND', 404)

  return ok({ professional: data })
}

// ─── DELETE /api/professionals/[id] ──────────────────────────────────────────
// Soft delete: sets is_active = false
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const staffUser = await resolveStoreUser(req)
  if (requireAdmin(staffUser)) return err('Unauthorized', 'UNAUTHORIZED', 401)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase  = getSupabaseServerClient() as any
  const tenant_id = staffUser!.tenant_id

  const { error } = await supabase
    .from('professionals')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant_id)

  if (error) {
    console.error('[DELETE /api/professionals/[id]]', error.message)
    return err(error.message, 'DB_ERROR', 500)
  }

  return ok({ deleted: true })
}
