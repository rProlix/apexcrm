import { createSessionServerClient } from '@/lib/supabase/server'

/**
 * Returns the current Supabase session from request cookies.
 * Returns null if not authenticated or session has expired.
 *
 * Prefer getUser() for security-sensitive checks — getSession() does not
 * re-validate the JWT with the Supabase Auth server.
 */
export async function getSession() {
  const supabase = await createSessionServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session
}
