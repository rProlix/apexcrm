// app/(customer)/store/page.tsx
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTenantFromHost } from '@/lib/tenant/getTenantFromHost'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ShoppingBag, Package } from 'lucide-react'

export default async function CustomerStorePage() {
  const host   = headers().get('host') ?? ''
  const tenant = await getTenantFromHost(host)
  if (!tenant) redirect('/')

  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: productsRaw } = await (supabase as any)
    .from('products')
    .select('id, name, description, price, currency, inventory_count')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  const products = (productsRaw ?? []) as Array<{
    id: string; name: string; description: string | null
    price: number; currency: string; inventory_count: number
  }>

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
          <ShoppingBag className="h-5 w-5 text-amber-400" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Store</h1>
          <p className="text-sm text-white/40">{tenant.name}</p>
        </div>
      </div>

      {/* Product grid */}
      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mb-4">
            <Package className="h-7 w-7 text-amber-400/50" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">No products available</h3>
          <p className="text-sm text-white/40">Check back soon.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/store/${product.id}`}
              className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 rounded-2xl"
            >
              <div className="rounded-2xl premium-panel premium-border p-5 hover:shadow-panel-lg transition-all duration-200 hover:border-amber-400/30 cursor-pointer">
                {/* Icon */}
                <div className="h-12 w-12 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mb-4 group-hover:bg-amber-400/16 transition-colors">
                  <Package className="h-6 w-6 text-amber-400" strokeWidth={1.75} />
                </div>

                {/* Name + description */}
                <h2 className="text-sm font-semibold text-white mb-1 line-clamp-2 leading-snug">
                  {product.name}
                </h2>
                {product.description && (
                  <p className="text-xs text-white/40 line-clamp-2 mb-3">
                    {product.description}
                  </p>
                )}

                {/* Price + stock */}
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/6">
                  <span className="text-base font-bold text-amber-400">
                    {product.currency}{' '}
                    {Number(product.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-lg border ${
                    product.inventory_count > 0
                      ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                      : 'text-white/30 bg-white/4 border-white/8'
                  }`}>
                    {product.inventory_count > 0 ? 'In Stock' : 'Out of Stock'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
