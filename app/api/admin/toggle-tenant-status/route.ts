// app/api/admin/toggle-tenant-status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'

/**
 * POST /api/admin/toggle-tenant-status
 *
 * Body: { tenant_id: string; status: 'active' | 'inactive' | 'suspended' }
 *
 * Only callable by the platform owner (role === 'owner').
 */
export async function POST(req: NextRequest) {
  const sessionClient = await createSessionServerClient()
  const { data: { user }, error: authError } = await sessionClient.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseServerClient()
  const { data: userRecord } = await admin
    .from('users')
    .select('role')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!userRecord || userRecord.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { tenant_id?: unknown; status?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { tenant_id, status } = body
  const VALID_STATUSES = ['active', 'inactive', 'suspended']

  if (
    typeof tenant_id !== 'string' || !tenant_id ||
    typeof status !== 'string' || !VALID_STATUSES.includes(status)
  ) {
    return NextResponse.json(
      { error: 'tenant_id (string) and status ("active" | "inactive" | "suspended") are required' },
      { status: 400 }
    )
  }

  const { data: tenant } = await admin
    .from('tenants')
    .select('id')
    .eq('id', tenant_id)
    .maybeSingle()

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  const { error: updateError } = await admin
    .from('tenants')
    .update({ status })
    .eq('id', tenant_id)

  if (updateError) {
    console.error('[toggle-tenant-status] update error:', updateError.message)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, tenant_id, status })
}
