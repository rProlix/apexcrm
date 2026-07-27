import { NextResponse } from 'next/server'
import { createSessionServerClient } from '@/lib/supabase/server'
import { loginSchema } from '@/lib/validation/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const parsed = loginSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Enter a valid email and password.' },
        { status: 400 },
      )
    }

    const supabase = await createSessionServerClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email:    parsed.data.email,
      password: parsed.data.password,
    })

    if (error || !data.session) {
      return NextResponse.json(
        {
          error: error?.message === 'Invalid login credentials'
            ? 'Incorrect email or password. Please try again.'
            : error?.message ?? 'Unable to sign in. Please try again.',
        },
        { status: 401 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[auth/login] unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 },
    )
  }
}
