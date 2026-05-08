// app/api/customers/invites/[id]/revoke/route.ts
// POST /api/customers/invites/[id]/revoke — revoke a pending invite

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { hasPermission } from '@/lib/auth/permissions'
import { getSupabaseServerClient } from '@/lib/supabase/server'

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, code, error: message }, { status })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const ctx = await getUserContext()
  if (!ctx) return err('UNAUTHORIZED', 'Authentication required.', 401)
  if (!hasPermission(ctx.role, 'manage_customers')) {
    return err('FORBIDDEN', 'You do not have permission to revoke invites.', 403)
  }

  const tenantId = ctx.tenant_id
  if (!tenantId) return err('TENANT_NOT_FOUND', 'No tenant associated with your account.', 400)

  const supabase = getSupabaseServerClient()

  // Load invite — strictly scoped to tenant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invite } = await (supabase as any)
    .from('customer_invites')
    .select('id, status')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!invite) return err('INVITE_NOT_FOUND', 'Invite not found.', 404)

  if (invite.status === 'accepted') return err('INVITE_ACCEPTED', 'Cannot revoke an accepted invite.', 409)
  if (invite.status === 'revoked')  return err('INVITE_ALREADY_REVOKED', 'This invite is already revoked.', 409)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase as any)
    .from('customer_invites')
    .update({
      status:     'revoked',
      revoked_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    console.error('[POST /api/customers/invites/[id]/revoke]', updateError.message)
    return err('SERVER_ERROR', 'Failed to revoke invite.', 500)
  }

  return NextResponse.json({ ok: true, id, status: 'revoked' })
}
