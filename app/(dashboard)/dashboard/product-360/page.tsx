export const dynamic = 'force-dynamic'

// app/(dashboard)/dashboard/product-360/page.tsx
import { requireP360ManagerAccess }   from '@/lib/product-360/auth'
import { isModuleEnabled }            from '@/lib/modules/guardModuleAccess'
import { Product360StudioClient }     from '@/components/product-360/Product360StudioClient'
import { getSupabaseServerClient }    from '@/lib/supabase/server'

export const metadata = { title: '360 Product Studio' }

export default async function Product360StudioPage() {
  const ctx = await requireP360ManagerAccess()

  // Check if module is enabled for this tenant (owner bypasses)
  let moduleEnabled = ctx.role === 'owner'
  if (!moduleEnabled && ctx.tenant_id) {
    moduleEnabled = await isModuleEnabled(ctx.tenant_id, 'product_360')
  }

  // For owner role, fetch tenants for selector
  let tenants: { id: string; name: string; slug: string }[] = []
  if (ctx.role === 'owner') {
    const supabase = getSupabaseServerClient()
    const { data } = await supabase
      .from('tenants')
      .select('id, name, slug')
      .order('name')
    tenants = (data ?? []) as typeof tenants
  }

  // Resolve default tenantId to show
  const defaultTenantId = ctx.tenant_id ?? tenants[0]?.id ?? ''

  return (
    <Product360StudioClient
      userRole={ctx.role}
      defaultTenantId={defaultTenantId}
      tenants={tenants}
      moduleEnabled={moduleEnabled}
    />
  )
}
