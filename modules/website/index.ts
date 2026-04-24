// modules/website/index.ts
import { Globe } from 'lucide-react'
import type { ModuleDefinition } from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const websiteModule: ModuleDefinition = {
  key:         'website',
  label:       'Website',
  description: 'Build and publish a branded public website connected to your CRM and store',
  icon:        Globe,
  href:        '/website',
  color:       'text-violet-400',
  bgColor:     'bg-violet-400/10',
  order:       10,

  stats: [
    {
      key:          'website_pages',
      label:        'Pages',
      category:     'usage',
      color:        'text-violet-400',
      emptyMessage: 'No pages yet',
      async getValue(tenantId) {
        const db = getSupabaseServerClient()
        const { count } = await db
          .from('site_pages')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .neq('status', 'archived')
        return count ?? 0
      },
    },
    {
      key:          'website_published',
      label:        'Status',
      category:     'usage',
      color:        'text-emerald-400',
      emptyMessage: 'Not published',
      async getValue(tenantId) {
        const db = getSupabaseServerClient()
        const { data } = await db
          .from('site_settings')
          .select('is_published')
          .eq('tenant_id', tenantId)
          .maybeSingle()
        return data?.is_published ? 'Live' : 'Draft'
      },
    },
  ],

  async getStats(tenantId) {
    const db = getSupabaseServerClient()

    const [{ count: pages }, settingsResult] = await Promise.all([
      db
        .from('site_pages')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .neq('status', 'archived'),
      db
        .from('site_settings')
        .select('is_published, site_name')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
    ])

    const isPublished = settingsResult.data?.is_published ?? false

    return [
      { label: 'Pages',  value: pages ?? 0 },
      { label: 'Status', value: isPublished ? 'Live' : 'Draft' },
    ]
  },
}
