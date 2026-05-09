// app/api/owner/business-users/[id]/reset-password/route.ts
// POST /api/owner/business-users/[id]/reset-password
// Owner sets a new password for a business user.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, code, error: message }, { status })
}

interface RouteContext { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const ctx = await getUserContext()
  if (!ctx)               return err('UNAUTHORIZED', 'Authentication required.', 401)
  if (ctx.role !== 'owner') return err('FORBIDDEN', 'Only the platform owner can reset passwords.', 403)

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return err('INVALID_JSON', 'Request body must be valid JSON.', 400)
  }

  const password = typeof body.password === 'string' ? body.password : ''
  if (!password || password.length < 8) {
    return err('INVALID_PASSWORD', 'Password must be at least 8 characters.', 400)
  }

  const supabase = getSupabaseServerClient()

  // Load target row to get auth_user_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: target } = await (supabase as any)
    .from('users')
    .select('id, auth_user_id, role')
    .eq('id', id)
    .maybeSingle()

  if (!target) return err('NOT_FOUND', 'Business user not found.', 404)
  if (!target.auth_user_id) {
    return err('NO_AUTH_ACCOUNT', 'This user does not have a linked auth account.', 409)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: authError } = await (supabase as any).auth.admin.updateUserById(
    target.auth_user_id,
    { password }
  )

  if (authError) {
    console.error('[POST /api/owner/business-users/[id]/reset-password]', authError.message)
    return err('AUTH_UPDATE_FAILED', 'Failed to reset password. Please try again.', 500)
  }

  // Do NOT store password in the database
  return NextResponse.json({ ok: true, id })
}
