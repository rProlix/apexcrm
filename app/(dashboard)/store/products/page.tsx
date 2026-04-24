// app/(dashboard)/store/products/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ProductsClient } from '@/components/store/ProductsClient'

export const metadata = { title: 'Products — Store' }

export default async function ProductsPage() {
  const ctx = await requireRole(['owner', 'admin'])

  if (ctx.tenant_id) {
    await guardModuleAccess(ctx.tenant_id, 'store', ctx.role)
  }

  const supabase = getSupabaseServerClient()
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('tenant_id', ctx.tenant_id ?? '')
    .order('created_at', { ascending: false })

  return (
    <ProductsClient
      initialProducts={products ?? []}
      tenantId={ctx.tenant_id ?? ''}
    />
  )
}
