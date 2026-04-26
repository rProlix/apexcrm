import { redirect } from 'next/navigation'
import { createSessionServerClient } from '@/lib/supabase/server'

/**
 * Redirects already-authenticated users away from public auth pages
 * (login, signup). Call at the top of server components for /login and /signup.
 *
 * @param destination  Where to send the authenticated user (default: /dashboard)
 */
export async function redirectIfAuthed(destination = '/dashboard') {
  try {
    const supabase = await createSessionServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) redirect(destination)
  } catch {
    // Supabase unavailable — stay on the login/signup page
  }
}
