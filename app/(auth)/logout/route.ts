import { NextRequest, NextResponse } from 'next/server'
import { createSessionServerClient } from '@/lib/supabase/server'

/**
 * GET /logout
 * Signs the user out of Supabase Auth (clears session cookies) and
 * redirects to /login. Safe to call from a plain <a href="/logout"> link.
 */
export async function GET(request: NextRequest) {
  const supabase = createSessionServerClient()
  await supabase.auth.signOut()

  return NextResponse.redirect(new URL('/login', request.url))
}
