// lib/pov/db.ts
// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY data-access helpers for the POV Event App.
//
// The pov_* tables are not in the generated Supabase types yet, so we cast the
// service-role client to a loose query builder (same pattern used by the
// website_3d_assets routes). All callers must authorize the request first —
// the service-role client bypasses RLS.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { getSupabaseServerClient } from '@/lib/supabase/server'

/* eslint-disable @typescript-eslint/no-explicit-any */
export function povDb(): any {
  return getSupabaseServerClient() as any
}

/** Best-effort cleanup of expired guest sessions for an event. */
export async function purgeExpiredSessions(eventId: string): Promise<void> {
  try {
    await povDb()
      .from('pov_guest_sessions')
      .delete()
      .eq('event_id', eventId)
      .lt('expires_at', new Date().toISOString())
  } catch {
    // non-fatal
  }
}
