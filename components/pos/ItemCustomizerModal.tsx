'use client'

import { useState, useMemo } from 'react'
import { X, Plus, Minus } from 'lucide-react'
import { formatCents } from '@/lib/pos/calculateOrder'
import type { POSProduct, POSModifierGroup, CartItem, CartModifierSelection, POSSettings } from '@/lib/pos/types'

interface Props {
  product:      POSProduct
  editingItem:  CartItem | null
  settings:     POSSettings | null
  onConfirm:    (item: Omit<CartItem, 'cart_key'>) => void
  onClose:      () => void
}

export function ItemCustomizerModal({ product, editingItem, settings, onConfirm, onClose }: Props) {
  const [quantity, setQty]           = useState(editingItem?.quantity ?? 1)
  const [notes, setNotes]            = useState(editingItem?.notes ?? '')
  const [kitchenNotes, setKNotes]    = useState(editingItem?.kitchen_notes ?? '')
  const [selectedMods, setSelectedMods] = useState<CartModifierSelection[]>(editingItem?.modifiers ?? [])
  const [error, setError]            = useState<string | null>(null)

  const modifierGroups: POSModifierGroup[] = (product.modifier_groups ?? []) as POSModifierGroup[]

  const toggleModifier = (group: POSModifierGroup, modifier: {
    id: string; name: string; modifier_type: string; price_delta_cents: number;
    inventory_item_id: string | null; affects_inventory: boolean; quantity_delta: number;
  }) => {
    const sel: CartModifierSelection = {
      modifier_group_id:  group.id,
      modifier_id:        modifier.id,
      name:               modifier.name,
      modifier_type:      modifier.modifier_type as CartModifierSelection['modifier_type'],
      price_delta_cents:  modifier.price_delta_cents,
      quantity:           1,
      inventory_item_id:  modifier.inventory_item_id,
      affects_inventory:  modifier.affects_inventory,
      quantity_delta:     modifier.quantity_delta,
    }

    setSelectedMods((prev) => {
      const exists = prev.findIndex((m) => m.modifier_id === modifier.id)
      if (exists >= 0) {
        return prev.filter((_, i) => i !== exists)
      }
      if (group.selection_type === 'single') {
        const withoutGroup = prev.filter((m) => m.modifier_group_id !== group.id)
        return [...withoutGroup, sel]
      }
      if (group.max_allowed && prev.filter((m) => m.modifier_group_id === group.id).length >= group.max_allowed) {
        return prev
      }
      return [...prev, sel]
    })
  }

  const isSelected = (modId: string) => selectedMods.some((m) => m.modifier_id === modId)

  const modifierTotal = useMemo(() =>
    selectedMods.reduce((s, m) => s + m.price_delta_cents * m.quantity, 0),
  [selectedMods])

  const unitWithMods  = product.price_cents + modifierTotal
  const lineTotal     = Math.round(unitWithMods * quantity)

  const validate = () => {
    for (const group of modifierGroups) {
      const selected = selectedMods.filter((m) => m.modifier_group_id === group.id)
      if (group.is_required && selected.length < group.min_required) {
        setError(`Please select at least ${group.min_required} option(s) for "${group.name}"`)
        return false
      }
    }
    return true
  }

  const handleConfirm = () => {
    if (!validate()) return
    onConfirm({
      product_id:       product.id,
      name:             product.name,
      item_type:        'product',
      quantity,
      unit_price_cents: product.price_cents,
      modifiers:        selectedMods,
      notes:            notes.trim(),
      kitchen_notes:    kitchenNotes.trim(),
      taxable:          true,
      tax_rate:         null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full sm:max-w-lg bg-zinc-900 sm:rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">{product.name}</h2>
            <p className="text-sm text-violet-400">{formatCents(product.price_cents)}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
          )}

          {/* Modifier groups */}
          {modifierGroups.map((group) => {
            const groupSelected = selectedMods.filter((m) => m.modifier_group_id === group.id)
                const mods = ((group.modifiers ?? []) as unknown as Record<string, unknown>[]).filter((m) => m.status === 'active')

            return (
              <div key={group.id}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-zinc-200">{group.name}</h3>
                  {group.is_required && (
                    <span className="text-xs bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full">Required</span>
                  )}
                  {group.max_allowed && (
                    <span className="text-xs text-zinc-500">Up to {group.max_allowed}</span>
                  )}
                </div>
                {group.description && <p className="text-xs text-zinc-500 mb-2">{group.description}</p>}

                <div className="grid grid-cols-2 gap-2">
                  {mods.map((mod: Record<string, unknown>) => {
                    const sel = isSelected(mod.id as string)
                    const priceDelta = mod.price_delta_cents as number

                    return (
                      <button
                        key={mod.id as string}
                        onClick={() => toggleModifier(group, mod as Parameters<typeof toggleModifier>[1])}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                          sel
                            ? 'bg-violet-600 border-violet-500 text-white'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                        }`}
                      >
                        <span className="font-medium leading-tight">{mod.name as string}</span>
                        {priceDelta !== 0 && (
                          <span className={`text-xs ml-2 flex-none ${sel ? 'text-violet-200' : priceDelta > 0 ? 'text-zinc-400' : 'text-green-400'}`}>
                            {priceDelta > 0 ? '+' : ''}{formatCents(priceDelta)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {group.is_required && groupSelected.length < group.min_required && (
                  <p className="text-xs text-yellow-500 mt-1">
                    Select {group.min_required - groupSelected.length} more
                  </p>
                )}
              </div>
            )
          })}

          {/* Notes */}
          {settings?.allow_item_notes !== false && (
            <div>
              <label className="text-sm font-medium text-zinc-300 block mb-1.5">Item Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. No onion, sauce on side…"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
              />
            </div>
          )}

          {settings?.allow_kitchen_notes !== false && (
            <div>
              <label className="text-sm font-medium text-zinc-300 block mb-1.5">Kitchen Notes</label>
              <input
                type="text"
                value={kitchenNotes}
                onChange={(e) => setKNotes(e.target.value)}
                placeholder="e.g. Well done, separate plate…"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button onClick={() => setQty(Math.max(1, quantity - 1))} className="w-9 h-9 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors">
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-lg font-bold text-zinc-100 w-6 text-center">{quantity}</span>
              <button onClick={() => setQty(quantity + 1)} className="w-9 h-9 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-500">Total</p>
              <p className="text-lg font-bold text-violet-400">{formatCents(lineTotal)}</p>
            </div>
          </div>
          <button
            onClick={handleConfirm}
            className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold text-sm transition-colors"
          >
            {editingItem ? 'Update Item' : 'Add to Order'}
          </button>
        </div>
      </div>
    </div>
  )
}
