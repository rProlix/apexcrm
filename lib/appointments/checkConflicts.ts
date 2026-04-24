// lib/appointments/checkConflicts.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'

interface ConflictCheck {
  tenant_id:   string
  starts_at:   string
  ends_at:     string
  exclude_id?: string  // omit current appointment when rescheduling
}

/**
 * Returns true if the proposed time window overlaps with any
 * existing non-canceled appointment or blocked time for the tenant.
 */
export async function checkConflicts({
  tenant_id,
  starts_at,
  ends_at,
  exclude_id,
}: ConflictCheck): Promise<boolean> {
  const supabase = getSupabaseServerClient()

  // Check existing appointments overlap:
  //   existing.starts_at < new.ends_at AND existing.ends_at > new.starts_at
  let apptQuery = supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant_id)
    .neq('status', 'canceled')
    .lt('starts_at', ends_at)
    .gt('ends_at', starts_at)

  if (exclude_id) {
    apptQuery = apptQuery.neq('id', exclude_id)
  }

  const { count: apptCount, error: apptErr } = await apptQuery
  if (apptErr) {
    console.error('[checkConflicts] appointment query error:', apptErr.message)
    return false
  }
  if ((apptCount ?? 0) > 0) return true

  // Check blocked_times overlap
  const { count: blockCount, error: blockErr } = await supabase
    .from('blocked_times')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant_id)
    .lt('start_time', ends_at)
    .gt('end_time', starts_at)

  if (blockErr) {
    console.error('[checkConflicts] blocked_times query error:', blockErr.message)
    return false
  }

  return (blockCount ?? 0) > 0
}
