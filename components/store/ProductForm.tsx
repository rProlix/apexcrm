'use client'
// components/store/ProductForm.tsx
import { useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { X } from 'lucide-react'

const productSchema = z.object({
  name:            z.string().min(1, 'Name is required').max(200),
  description:     z.string().max(2000).optional(),
  price:           z.number({ invalid_type_error: 'Price must be a number' }).min(0, 'Price must be ≥ 0'),
  currency:        z.string().length(3).default('USD'),
  inventory_count: z.number().int().min(0, 'Inventory must be ≥ 0').default(0),
  is_active:       z.boolean().default(true),
})

type ProductFormData = z.infer<typeof productSchema>

export interface ProductFormValues {
  id?:             string
  name:            string
  description:     string | null
  price:           number
  currency:        string
  inventory_count: number
  is_active:       boolean
}

interface Props {
  tenantId:  string
  product?:  ProductFormValues
  onSuccess: (product: ProductFormValues) => void
  onCancel:  () => void
}

export function ProductForm({ tenantId, product, onSuccess, onCancel }: Props) {
  const isEdit = Boolean(product?.id)

  const [form, setForm] = useState<{
    name:            string
    description:     string
    price:           string
    currency:        string
    inventory_count: string
    is_active:       boolean
  }>({
    name:            product?.name            ?? '',
    description:     product?.description     ?? '',
    price:           product?.price != null   ? String(product.price) : '',
    currency:        product?.currency        ?? 'USD',
    inventory_count: product?.inventory_count != null ? String(product.inventory_count) : '0',
    is_active:       product?.is_active       ?? true,
  })

  const [errors,  setErrors]  = useState<Partial<Record<keyof ProductFormData, string>>>({})
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setApiError(null)

    const parsed = productSchema.safeParse({
      name:            form.name,
      description:     form.description || undefined,
      price:           parseFloat(form.price),
      currency:        form.currency,
      inventory_count: parseInt(form.inventory_count, 10),
      is_active:       form.is_active,
    })

    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof ProductFormData, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ProductFormData
        fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setLoading(true)

    try {
      const url    = isEdit ? `/api/store/products/${product!.id}` : '/api/store/products'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed.data, tenant_id: tenantId }),
      })

      const json = await res.json()

      if (!res.ok) {
        setApiError(json.error ?? 'Something went wrong')
        return
      }

      onSuccess(json.product)
    } catch {
      setApiError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg premium-panel premium-border rounded-2xl p-6 shadow-panel-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">
            {isEdit ? 'Edit Product' : 'New Product'}
          </h2>
          <button
            onClick={onCancel}
            className="h-8 w-8 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {apiError && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">
            <p className="text-sm text-red-400">{apiError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <Field label="Product Name" error={errors.name}>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Premium Widget"
              className="store-input"
            />
          </Field>

          {/* Description */}
          <Field label="Description" error={errors.description}>
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Product description (optional)"
              rows={3}
              className="store-input resize-none"
            />
          </Field>

          {/* Price + Currency row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Price" error={errors.price}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => update('price', e.target.value)}
                  placeholder="0.00"
                  className="store-input"
                />
              </Field>
            </div>
            <Field label="Currency" error={errors.currency}>
              <input
                type="text"
                maxLength={3}
                value={form.currency}
                onChange={(e) => update('currency', e.target.value.toUpperCase())}
                placeholder="USD"
                className="store-input"
              />
            </Field>
          </div>

          {/* Inventory */}
          <Field label="Inventory Count" error={errors.inventory_count}>
            <input
              type="number"
              min="0"
              step="1"
              value={form.inventory_count}
              onChange={(e) => update('inventory_count', e.target.value)}
              placeholder="0"
              className="store-input"
            />
          </Field>

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-xl bg-white/4 border border-white/8 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Active</p>
              <p className="text-xs text-white/40">Visible to customers in the store</p>
            </div>
            <button
              type="button"
              onClick={() => update('is_active', !form.is_active)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                form.is_active ? 'bg-amber-500' : 'bg-white/10'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                  form.is_active ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              loading={loading}
            >
              {isEdit ? 'Save Changes' : 'Create Product'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-white/60 uppercase tracking-wider">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
