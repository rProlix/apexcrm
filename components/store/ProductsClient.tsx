'use client'
// components/store/ProductsClient.tsx
import { useState } from 'react'
import { Plus, Pencil, Trash2, Package, ToggleLeft, ToggleRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ProductForm, type ProductFormValues } from '@/components/store/ProductForm'

interface Product extends ProductFormValues {
  id:         string
  created_at: string
  currency:   string
}

interface Props {
  initialProducts: Product[]
  tenantId:        string
}

export function ProductsClient({ initialProducts, tenantId }: Props) {
  const [products,      setProducts]      = useState<Product[]>(initialProducts)
  const [showForm,      setShowForm]      = useState(false)
  const [editTarget,    setEditTarget]    = useState<Product | null>(null)
  const [deleting,      setDeleting]      = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  function openCreate() {
    setEditTarget(null)
    setShowForm(true)
  }

  function openEdit(product: Product) {
    setEditTarget(product)
    setShowForm(true)
  }

  function handleFormSuccess(saved: ProductFormValues) {
    const full = saved as Product
    setProducts((prev) => {
      const idx = prev.findIndex((p) => p.id === full.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = full
        return next
      }
      return [full, ...prev]
    })
    setShowForm(false)
    setEditTarget(null)
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      const res = await fetch(`/api/store/products/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setProducts((prev) => prev.filter((p) => p.id !== id))
      }
    } finally {
      setDeleting(null)
      setDeleteConfirm(null)
    }
  }

  async function toggleActive(product: Product) {
    const res = await fetch(`/api/store/products/${product.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_active: !product.is_active }),
    })
    if (res.ok) {
      const { product: updated } = await res.json()
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Products</h1>
          <p className="text-sm text-white/40 mt-0.5">
            {products.length} product{products.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="primary" size="md" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Product
        </Button>
      </div>

      {/* Product grid */}
      {products.length === 0 ? (
        <EmptyState onAdd={openCreate} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              deleting={deleting === product.id}
              confirmingDelete={deleteConfirm === product.id}
              onEdit={() => openEdit(product)}
              onToggle={() => toggleActive(product)}
              onDeleteRequest={() => setDeleteConfirm(product.id)}
              onDeleteConfirm={() => handleDelete(product.id)}
              onDeleteCancel={() => setDeleteConfirm(null)}
            />
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <ProductForm
          tenantId={tenantId}
          product={editTarget ?? undefined}
          onSuccess={handleFormSuccess}
          onCancel={() => { setShowForm(false); setEditTarget(null) }}
        />
      )}
    </div>
  )
}

// ─── Product Card ─────────────────────────────────────────────────────────────

interface CardProps {
  product:          Product
  deleting:         boolean
  confirmingDelete: boolean
  onEdit:           () => void
  onToggle:         () => void
  onDeleteRequest:  () => void
  onDeleteConfirm:  () => void
  onDeleteCancel:   () => void
}

function ProductCard({
  product,
  deleting,
  confirmingDelete,
  onEdit,
  onToggle,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: CardProps) {
  return (
    <div className="group premium-panel premium-border rounded-2xl p-5 hover:shadow-panel-lg transition-shadow duration-200">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
          <Package className="h-5 w-5 text-amber-400" strokeWidth={1.75} />
        </div>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-lg border ${
            product.is_active
              ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
              : 'text-white/30 bg-white/4 border-white/8'
          }`}
        >
          {product.is_active ? 'Active' : 'Draft'}
        </span>
      </div>

      {/* Info */}
      <h3 className="text-sm font-semibold text-white leading-snug mb-1 line-clamp-2">
        {product.name}
      </h3>
      {product.description && (
        <p className="text-xs text-white/40 line-clamp-2 mb-3">{product.description}</p>
      )}

      {/* Price + Inventory */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-lg font-bold text-amber-400">
          {product.currency}{' '}
          {Number(product.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </span>
        <span className="text-xs text-white/40">
          {product.inventory_count} in stock
        </span>
      </div>

      {/* Actions */}
      {confirmingDelete ? (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 space-y-2">
          <p className="text-xs text-red-400 text-center">Delete this product?</p>
          <div className="flex gap-2">
            <button
              onClick={onDeleteCancel}
              className="flex-1 h-8 rounded-lg text-xs text-white/60 hover:text-white bg-white/4 hover:bg-white/8 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onDeleteConfirm}
              disabled={deleting}
              className="flex-1 h-8 rounded-lg text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onToggle}
            title={product.is_active ? 'Deactivate' : 'Activate'}
            className="h-8 w-8 rounded-lg text-white/40 hover:text-amber-400 hover:bg-amber-400/8 transition-colors flex items-center justify-center"
          >
            {product.is_active
              ? <ToggleRight className="h-4 w-4" />
              : <ToggleLeft  className="h-4 w-4" />
            }
          </button>
          <button
            onClick={onEdit}
            className="flex-1 h-8 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/8 transition-colors flex items-center justify-center gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            onClick={onDeleteRequest}
            className="h-8 w-8 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/8 transition-colors flex items-center justify-center"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-16 w-16 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mb-4">
        <Package className="h-8 w-8 text-amber-400/60" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-white mb-1">No products yet</h3>
      <p className="text-sm text-white/40 mb-6 max-w-xs">
        Add your first product to start selling through your store.
      </p>
      <Button variant="primary" size="md" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Add First Product
      </Button>
    </div>
  )
}
