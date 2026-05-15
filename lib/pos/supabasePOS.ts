// lib/pos/supabasePOS.ts
// Returns supabase client cast as any for POS tables not yet
// in the generated types. Replace with typed client after running supabase gen types.

import { getSupabaseServerClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPOSClient(): any {
  return getSupabaseServerClient() as any
}

export { getSupabaseServerClient }
