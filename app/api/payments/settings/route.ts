// app/api/payments/settings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPaymentSettings, upsertPaymentSettings } from '@/lib/payments/getPaymentSettings'

// ── GET /api/payments/settings ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin', 'owner'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = user.role === 'owner'
    ? (req.nextUrl.searchParams.get('tenant_id') ?? user.tenant_id)
    : user.tenant_id

  try {
    const settings = await getPaymentSettings(tenantId)
    // Never expose webhook_secret to client
    const { webhook_secret: _secret, ...safe } = settings
    return NextResponse.json({ settings: safe })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// ── PATCH /api/payments/settings ─────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
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

  const allowed = [
    'default_provider',
    'currency',
    'tax_rate',
    'allow_manual_invoices',
    'allow_saved_payment_methods',
    'allow_partial_payments',
    'receipt_email_enabled',
  ] as const

  type AllowedKey = (typeof allowed)[number]
  const updates: Partial<Record<AllowedKey, unknown>> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (typeof updates.tax_rate !== 'undefined') {
    const rate = Number(updates.tax_rate)
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return NextResponse.json({ error: 'tax_rate must be 0–100' }, { status: 400 })
    }
    updates.tax_rate = rate
  }

  try {
    const settings = await upsertPaymentSettings(tenantId, updates as Parameters<typeof upsertPaymentSettings>[1])
    const { webhook_secret: _secret, ...safe } = settings
    return NextResponse.json({ settings: safe })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
