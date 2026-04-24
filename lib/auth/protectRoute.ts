import { redirect } from 'next/navigation'
import { createSessionServerClient } from '@/lib/supabase/server'

/**
 * Server-side route guard. Validates the session JWT with Supabase Auth
 * and redirects unauthenticated visitors to /login.
 * Returns the verified Supabase Auth user on success.
 */
export async function protectRoute() {
  const supabase = await createSessionServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return user
}
