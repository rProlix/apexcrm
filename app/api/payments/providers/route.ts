// app/api/payments/providers/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// ── GET /api/payments/providers ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin', 'owner'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = user.role === 'owner'
    ? (req.nextUrl.searchParams.get('tenant_id') ?? user.tenant_id)
    : user.tenant_id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any
  const { data, error } = await supabase
    .from('payment_providers')
    .select('id, tenant_id, provider_key, is_enabled, is_default, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('provider_key')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ providers: data ?? [] })
}

// ── POST /api/payments/providers ─────────────────────────────────────────────
// Connect or update a payment provider
export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin', 'owner'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = user.role === 'owner'
    ? (req.nextUrl.searchParams.get('tenant_id') ?? user.tenant_id)
    : user.tenant_id

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { provider_key, secret_key, webhook_secret, account_id, is_default } = body

  if (!provider_key || typeof provider_key !== 'string') {
    return NextResponse.json({ error: 'provider_key is required' }, { status: 400 })
  }
  if (!['stripe', 'square'].includes(provider_key)) {
    return NextResponse.json({ error: 'provider_key must be stripe or square' }, { status: 400 })
  }
  if (!secret_key || typeof secret_key !== 'string') {
    return NextResponse.json({ error: 'secret_key is required' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  // If this is being set as default, unset others
  if (is_default) {
    await supabase
      .from('payment_providers')
      .update({ is_default: false })
      .eq('tenant_id', tenantId)
  }

  const config: Record<string, unknown> = {
    secretKey:    secret_key,
    webhookSecret: webhook_secret ?? null,
    accountId:    account_id     ?? null,
  }

  const { data, error } = await supabase
    .from('payment_providers')
    .upsert(
      {
        tenant_id:    tenantId,
        provider_key,
        is_enabled:   true,
        is_default:   is_default ?? false,
        config,
      },
      { onConflict: 'tenant_id,provider_key' }
    )
    .select('id, provider_key, is_enabled, is_default, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also upsert payment_accounts
  await supabase.from('payment_accounts').upsert(
    {
      tenant_id:           tenantId,
      provider_key,
      provider_account_id: account_id ?? null,
      status:              'connected',
    },
    { onConflict: 'tenant_id,provider_key' }
  )

  return NextResponse.json({ provider: data }, { status: 201 })
}
