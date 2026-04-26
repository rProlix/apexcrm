export const dynamic = 'force-dynamic'

// app/(customer)/store/[productId]/page.tsx
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getTenantFromHost } from '@/lib/tenant/getTenantFromHost'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ProductDetailClient } from '@/components/store/ProductDetailClient'
import { ArrowLeft } from 'lucide-react'

interface Props {
  params: Promise<{ productId: string }>
}

export default async function ProductDetailPage({ params }: Props) {
  const { productId } = await params
  const host   = (await headers()).get('host') ?? ''
  const tenant = await getTenantFromHost(host)
  if (!tenant) redirect('/')

  const supabase = getSupabaseServerClient()
  const { data: product } = await supabase
    .from('products')
    .select('id, name, description, price, currency, inventory_count, is_active')
    .eq('id', productId)
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!product) notFound()

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/store"
        className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Store
      </Link>

      <ProductDetailClient product={product} tenantId={tenant.id} />
    </div>
  )
}
