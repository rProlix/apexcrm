// app/api/payments/providers/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// ── PATCH /api/payments/providers/[id] ───────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin', 'owner'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  // Verify the provider belongs to this tenant
  const { data: existing } = await supabase
    .from('payment_providers')
    .select('id, tenant_id, config')
    .eq('id', params.id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (user.role !== 'owner' && existing.tenant_id !== user.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if (typeof body.is_enabled === 'boolean') updates.is_enabled = body.is_enabled
  if (typeof body.is_default === 'boolean') {
    updates.is_default = body.is_default
    if (body.is_default) {
      await supabase
        .from('payment_providers')
        .update({ is_default: false })
        .eq('tenant_id', existing.tenant_id)
    }
  }

  // Allow updating credentials
  if (body.secret_key || body.webhook_secret || body.account_id) {
    const existingConfig = (existing.config ?? {}) as Record<string, unknown>
    updates.config = {
      ...existingConfig,
      ...(body.secret_key    ? { secretKey: body.secret_key }         : {}),
      ...(body.webhook_secret ? { webhookSecret: body.webhook_secret } : {}),
      ...(body.account_id    ? { accountId: body.account_id }         : {}),
    }
  }

  const { data, error } = await supabase
    .from('payment_providers')
    .update(updates)
    .eq('id', params.id)
    .select('id, provider_key, is_enabled, is_default, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ provider: data })
}

// ── DELETE /api/payments/providers/[id] ──────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin', 'owner'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseDel = getSupabaseServerClient() as any

  const { data: existing } = await supabaseDel
    .from('payment_providers')
    .select('id, tenant_id')
    .eq('id', params.id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (user.role !== 'owner' && existing.tenant_id !== user.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabaseDel
    .from('payment_providers')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
