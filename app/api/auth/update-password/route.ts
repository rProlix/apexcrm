// app/api/auth/update-password/route.ts
//
// Unified password update endpoint — works for ALL user types:
// business owners, admins, staff, and storefront customers.
//
// Password is stored only in Supabase Auth; no secondary tables are updated.
// This means a password change here is instantly effective for both the CRM
// and any tenant storefront that shares the same Supabase Auth identity.

import { NextResponse } from 'next/server'
import { createSessionServerClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { password, confirmPassword } = body as {
      password?:        string
      confirmPassword?: string
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'A new password is required.' },
        { status: 400 },
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters.' },
        { status: 400 },
      )
    }

    if (confirmPassword !== undefined && confirmPassword !== password) {
      return NextResponse.json(
        { error: 'Passwords do not match.' },
        { status: 400 },
      )
    }

    const supabase = await createSessionServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'You must be signed in to update your password.' },
        { status: 401 },
      )
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 },
      )
    }

    return NextResponse.json({
      message: 'Password updated. This password works for both your CRM and your business website.',
    })
  } catch {
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 },
    )
  }
}
