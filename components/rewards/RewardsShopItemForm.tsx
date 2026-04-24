'use client'
// components/rewards/RewardsShopItemForm.tsx
import { useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import { Gift, Plus } from 'lucide-react'
import type { ProductWithRewards } from '@/types/rewards'

interface Props {
  tenantId: string
  products: ProductWithRewards[]
  editItem?: {
    id:              string
    name:            string
    description:     string | null
    points_cost:     number
    is_active:       boolean
    product_id:      string | null
    redemption_type: string
    discount_type:   string | null
    discount_value:  number | null
    inventory_count: number
    max_redemptions_per_customer: number | null
  }
  onClose?: () => void
}

export function RewardsShopItemForm({ tenantId, products, editItem, onClose }: Props) {
  const [isPending, startTransition] = useTransition()
  const [show, setShow]  = useState(!!editItem)
  const [error, setError] = useState('')

  const [name, setName]             = useState(editItem?.name ?? '')
  const [description, setDescription] = useState(editItem?.description ?? '')
  const [pointsCost, setPointsCost] = useState(editItem?.points_cost ?? 100)
  const [isActive, setIsActive]     = useState(editItem?.is_active ?? true)
  const [productId, setProductId]   = useState(editItem?.product_id ?? '')
  const [redemptionType, setRedemptionType] = useState(editItem?.redemption_type ?? 'points_only')
  const [discountType, setDiscountType]     = useState(editItem?.discount_type ?? 'percent')
  const [discountValue, setDiscountValue]   = useState(editItem?.discount_value ?? 0)
  const [inventoryCount, setInventoryCount] = useState(editItem?.inventory_count ?? 0)
  const [maxPerCustomer, setMaxPerCustomer] = useState<number | ''>(editItem?.max_redemptions_per_customer ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    if (pointsCost <= 0) { setError('Points cost must be positive'); return }
    setError('')

    const payload = {
      name:                         name.trim(),
      description:                  description.trim() || null,
      points_cost:                  pointsCost,
      is_active:                    isActive,
      product_id:                   productId || null,
      redemption_type:              redemptionType,
      discount_type:                redemptionType === 'discount' ? discountType : null,
      discount_value:               redemptionType === 'discount' ? discountValue : null,
      inventory_count:              inventoryCount,
      max_redemptions_per_customer: maxPerCustomer === '' ? null : maxPerCustomer,
    }

    startTransition(async () => {
      try {
        const url    = editItem ? `/api/rewards/shop-items/${editItem.id}` : '/api/rewards/shop-items'
        const method = editItem ? 'PATCH' : 'POST'
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!res.ok) throw new Error((await res.json()).error)
        setShow(false)
        onClose?.()
        window.location.reload()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  return (
    <div className="space-y-4">
      {!show && !editItem && (
        <button
          onClick={() => setShow(true)}
          className="flex items-center gap-2 w-full premium-panel premium-border rounded-2xl p-4 text-white/40 hover:text-white/60 hover:border-gold-500/30 transition-all text-sm"
        >
          <Plus className="h-4 w-4" />
          Add new shop item
        </button>
      )}

      {show && (
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="premium-panel premium-border rounded-2xl p-5 space-y-4 border-gold-500/20"
        >
          <div className="flex items-center gap-3 mb-1">
            <div className="h-8 w-8 rounded-lg bg-gold-400/10 border border-gold-400/20 flex items-center justify-center">
              <Gift className="h-4 w-4 text-gold-400" strokeWidth={1.75} />
            </div>
            <h3 className="text-sm font-semibold text-white">{editItem ? 'Edit Shop Item' : 'New Shop Item'}</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/50 block mb-1.5">Item Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Free Coffee" className="store-input w-full rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1.5">Points Cost *</label>
              <input type="number" min={1} value={pointsCost} onChange={(e) => setPointsCost(Number(e.target.value))} className="store-input w-full rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="text-xs text-white/50 block mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What does the customer get?" className="store-input w-full rounded-xl px-3 py-2 text-sm resize-none" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/50 block mb-1.5">Linked Store Product</label>
              <select value={productId} onChange={(e) => setProductId(e.target.value)} className="store-input w-full rounded-xl px-3 py-2 text-sm">
                <option value="">None — standalone item</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1.5">Redemption Type</label>
              <select value={redemptionType} onChange={(e) => setRedemptionType(e.target.value)} className="store-input w-full rounded-xl px-3 py-2 text-sm">
                <option value="points_only">Points Only</option>
                <option value="free_item">Free Item</option>
                <option value="discount">Discount</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>

          {redemptionType === 'discount' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-white/50 block mb-1.5">Discount Type</label>
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} className="store-input w-full rounded-xl px-3 py-2 text-sm">
                  <option value="percent">Percentage</option>
                  <option value="fixed_amount">Fixed Amount</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1.5">
                  {discountType === 'percent' ? 'Percentage (%)' : 'Amount ($)'}
                </label>
                <input type="number" min={0} value={discountValue} onChange={(e) => setDiscountValue(Number(e.target.value))} className="store-input w-full rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/50 block mb-1.5">Inventory (0 = unlimited)</label>
              <input type="number" min={0} value={inventoryCount} onChange={(e) => setInventoryCount(Number(e.target.value))} className="store-input w-full rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1.5">Max Per Customer (blank = unlimited)</label>
              <input
                type="number" min={1}
                value={maxPerCustomer}
                onChange={(e) => setMaxPerCustomer(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Unlimited"
                className="store-input w-full rounded-xl px-3 py-2 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setIsActive(!isActive)}
              className={`relative h-5 w-9 rounded-full transition-colors cursor-pointer ${isActive ? 'bg-gold-400' : 'bg-white/10'}`}
            >
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-xs text-white/60">Active (visible to customers)</span>
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isPending} className="bg-gold-gradient text-graphite-900 font-semibold text-sm px-5 py-2 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
              {isPending ? 'Saving…' : editItem ? 'Update Item' : 'Create Item'}
            </button>
            <button type="button" onClick={() => { setShow(false); onClose?.() }} className="text-sm text-white/40 hover:text-white/60 transition-colors px-4 py-2">
              Cancel
            </button>
          </div>
        </motion.form>
      )}
    </div>
  )
}
