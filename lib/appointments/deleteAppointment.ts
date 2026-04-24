// lib/appointments/deleteAppointment.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface DeleteResult {
  success: boolean
  error?:  string
}

/**
 * Soft-deletes (cancels) an appointment.
 * Hard delete is only used when the appointment is already canceled.
 * Always scoped to tenant_id.
 */
export async function deleteAppointment(
  id:        string,
  tenant_id: string
): Promise<DeleteResult> {
  const supabase = getSupabaseServerClient() as any

  const { data: current, error: fetchErr } = await supabase
    .from('appointments')
    .select('status')
    .eq('id', id)
    .eq('tenant_id', tenant_id)
    .maybeSingle()

  if (fetchErr || !current) {
    return { success: false, error: 'Appointment not found' }
  }

  if (current.status === 'canceled') {
    // Hard delete already-canceled appointments
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenant_id)

    if (error) {
      console.error('[deleteAppointment hard]', error.message)
      return { success: false, error: error.message }
    }
    return { success: true }
  }

  // Soft cancel
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant_id)

  if (error) {
    console.error('[deleteAppointment soft]', error.message)
    return { success: false, error: error.message }
  }

  return { success: true }
}
