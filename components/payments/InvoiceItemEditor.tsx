'use client'
// components/payments/InvoiceItemEditor.tsx
import { Plus, Trash2 } from 'lucide-react'

export interface InvoiceItem {
  id?:          string
  name:         string
  description?: string
  quantity:     number
  unit_price:   number
  source_type?: string
}

interface Props {
  items:     InvoiceItem[]
  onChange:  (items: InvoiceItem[]) => void
  currency?: string
}

export function InvoiceItemEditor({ items, onChange, currency = 'USD' }: Props) {
  function add() {
    onChange([...items, { name: '', quantity: 1, unit_price: 0 }])
  }

  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx))
  }

  function update(idx: number, field: keyof InvoiceItem, value: string | number) {
    const next = items.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item
    )
    onChange(next)
  }

  const total = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="hidden sm:grid grid-cols-12 gap-2 px-1">
        <span className="col-span-5 text-xs font-medium text-white/40">Item</span>
        <span className="col-span-2 text-xs font-medium text-white/40 text-center">Qty</span>
        <span className="col-span-3 text-xs font-medium text-white/40 text-right">Unit Price</span>
        <span className="col-span-2 text-xs font-medium text-white/40 text-right">Total</span>
      </div>

      {/* Items */}
      {items.map((item, idx) => (
        <div key={idx} className="premium-panel premium-border rounded-xl p-3">
          <div className="grid grid-cols-12 gap-2 items-start">
            {/* Name */}
            <div className="col-span-12 sm:col-span-5">
              <input
                type="text"
                value={item.name}
                onChange={(e) => update(idx, 'name', e.target.value)}
                placeholder="Item name"
                className="store-input w-full text-sm"
              />
              <input
                type="text"
                value={item.description ?? ''}
                onChange={(e) => update(idx, 'description', e.target.value)}
                placeholder="Description (optional)"
                className="store-input w-full text-xs mt-1.5 text-white/50"
              />
            </div>

            {/* Qty */}
            <div className="col-span-4 sm:col-span-2">
              <label className="sm:hidden block text-xs text-white/40 mb-1">Qty</label>
              <input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) => update(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                className="store-input w-full text-sm text-center"
              />
            </div>

            {/* Unit price */}
            <div className="col-span-5 sm:col-span-3">
              <label className="sm:hidden block text-xs text-white/40 mb-1">Unit Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/30">
                  {currency}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unit_price}
                  onChange={(e) => update(idx, 'unit_price', Math.max(0, parseFloat(e.target.value) || 0))}
                  className="store-input w-full text-sm pl-12 text-right"
                />
              </div>
            </div>

            {/* Total */}
            <div className="col-span-2 sm:col-span-1 flex items-center justify-end sm:justify-end pt-1">
              <span className="text-sm font-semibold text-gold-400">
                {(item.quantity * item.unit_price).toFixed(2)}
              </span>
            </div>

            {/* Delete */}
            <div className="col-span-1 flex items-start justify-end pt-1">
              <button
                type="button"
                onClick={() => remove(idx)}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-400/8 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Add item */}
      <button
        type="button"
        onClick={add}
        className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border border-dashed border-white/15 text-xs text-white/40 hover:text-white/70 hover:border-white/25 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add item
      </button>

      {/* Total */}
      {items.length > 0 && (
        <div className="flex items-center justify-between pt-2 border-t border-white/6">
          <span className="text-xs text-white/40">Subtotal</span>
          <span className="text-base font-bold text-gold-400">
            {currency} {total.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  )
}
