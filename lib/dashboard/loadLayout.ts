import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { DashboardLayout } from '@/lib/dashboard/types'

export const DEFAULT_LAYOUT: DashboardLayout = {
  sections: [
    {
      id:      'operations',
      title:   'Operations',
      widgets: [],
    },
    {
      id:      'financial',
      title:   'Financial',
      widgets: [],
    },
    {
      id:      'usage',
      title:   'Usage & Billing',
      widgets: [],
    },
  ],
}

export async function loadLayout(tenantId: string): Promise<DashboardLayout> {
  const supabase = getSupabaseServerClient()

  const { data } = await supabase
    .from('dashboard_layouts')
    .select('layout')
    .eq('tenant_id', tenantId)
    .single()

  if (!data?.layout) return DEFAULT_LAYOUT

  const layout = data.layout as unknown as DashboardLayout

  // Ensure all default sections exist (migration safety)
  const existingIds = new Set(layout.sections.map((s) => s.id))
  for (const def of DEFAULT_LAYOUT.sections) {
    if (!existingIds.has(def.id)) {
      layout.sections.push({ ...def, widgets: [] })
    }
  }

  return layout
}
