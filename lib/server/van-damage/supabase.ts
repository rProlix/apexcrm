import { getSupabaseServerClient } from '@/lib/supabase/server'

export function getVanDamageServiceClient() {
  return getSupabaseServerClient()
}
