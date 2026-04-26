import { NextRequest, NextResponse } from 'next/server'
import { createSessionServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /logout
 * Signs the user out of Supabase Auth (clears session cookies) and
 * redirects to /login. Safe to call from a plain <a href="/logout"> link.
 * Always redirects even if Supabase is unreachable.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSessionServerClient()
    await supabase.auth.signOut()
  } catch {
    // Supabase unavailable — proceed with redirect anyway
  }

  return NextResponse.redirect(new URL('/login', request.url))
}
