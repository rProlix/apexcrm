'use server'

import { revalidatePath } from 'next/cache'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { DashboardLayout } from '@/lib/dashboard/types'

export async function saveLayout(tenantId: string, layout: DashboardLayout): Promise<void> {
  const supabase = getSupabaseServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('dashboard_layouts')
    .upsert(
      { tenant_id: tenantId, layout },
      { onConflict: 'tenant_id' }
    )

  revalidatePath('/dashboard')
}
