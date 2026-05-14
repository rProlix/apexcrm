'use client'

// components/inventory/InventoryItemsClient.tsx
import { useState, useMemo, useCallback } from 'react'
import {
  Package, Plus, Search, SlidersHorizontal, Edit2, Trash2,
  AlertTriangle, CheckCircle, Archive, Minus,
} from 'lucide-react'
import type { InventoryItem, InventoryItemType } from '@/lib/inventory/types'
import { ITEM_TYPE_LABELS } from '@/lib/inventory/types'

interface Props {
  initialItems: InventoryItem[]
  tenantId:     string
  canEdit:      boolean
}

const ITEM_TYPES: InventoryItemType[] = [
  'supply', 'ingredient', 'material', 'retail_stock',
  'tool', 'equipment', 'packaging', 'utensil', 'cleaning', 'other',
]

function QuantityBadge({ item }: { item: InventoryItem }) {
  if (item.current_quantity <= 0) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-400/10 text-red-400 font-medium">Out of Stock</span>
  }
  if (item.current_quantity <= item.reorder_point) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-orange-400/10 text-orange-400 font-medium">Low Stock</span>
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-green-400/10 text-green-400 font-medium">In Stock</span>
}

interface ItemFormData {
  name:              string
  description:       string
  sku:               string
  barcode:           string
  category:          string
  item_type:         InventoryItemType
  unit:              string
  current_quantity:  number
  reorder_point:     number
  target_quantity:   number | null
  cost_per_unit:     number | null
  supplier_name:     string
  supplier_phone:    string
  supplier_email:    string
  storage_location:  string
  is_sellable:       boolean
}

const defaultForm: ItemFormData = {
  name: '', description: '', sku: '', barcode: '', category: '',
  item_type: 'supply', unit: 'unit', current_quantity: 0, reorder_point: 0,
  target_quantity: null, cost_per_unit: null, supplier_name: '',
  supplier_phone: '', supplier_email: '', storage_location: '', is_sellable: false,
}

export function InventoryItemsClient({ initialItems, tenantId, canEdit }: Props) {
  const [items, setItems]           = useState<InventoryItem[]>(initialItems)
  const [search, setSearch]         = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCategory, setFilterCat] = useState('')
  const [filterLow, setFilterLow]   = useState(false)
  const [showModal, setShowModal]   = useState(false)
  const [editItem, setEditItem]     = useState<InventoryItem | null>(null)
  const [form, setForm]             = useState<ItemFormData>(defaultForm)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null)
  const [adjustDelta, setAdjustDelta] = useState<number>(0)
  const [adjustReason, setAdjustReason] = useState('')
  const [adjusting, setAdjusting]   = useState(false)

  const categories = useMemo(() => {
    const cats = new Set<string>()
    items.forEach((i) => { if (i.category) cats.add(i.category) })
    return Array.from(cats).sort()
  }, [items])

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filterType && item.item_type !== filterType) return false
      if (filterCategory && item.category !== filterCategory) return false
      if (filterLow && item.current_quantity > item.reorder_point) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !item.name.toLowerCase().includes(q) &&
          !item.sku?.toLowerCase().includes(q) &&
          !item.barcode?.toLowerCase().includes(q) &&
          !item.category?.toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [items, search, filterType, filterCategory, filterLow])

  function openNew() {
    setEditItem(null)
    setForm(defaultForm)
    setError(null)
    setShowModal(true)
  }

  function openEdit(item: InventoryItem) {
    setEditItem(item)
    setForm({
      name:             item.name,
      description:      item.description ?? '',
      sku:              item.sku ?? '',
      barcode:          item.barcode ?? '',
      category:         item.category ?? '',
      item_type:        item.item_type,
      unit:             item.unit,
      current_quantity: item.current_quantity,
      reorder_point:    item.reorder_point,
      target_quantity:  item.target_quantity,
      cost_per_unit:    item.cost_per_unit,
      supplier_name:    item.supplier_name ?? '',
      supplier_phone:   item.supplier_phone ?? '',
      supplier_email:   item.supplier_email ?? '',
      storage_location: item.storage_location ?? '',
      is_sellable:      item.is_sellable,
    })
    setError(null)
    setShowModal(true)
  }

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError(null)
    try {
      const method = editItem ? 'PATCH' : 'POST'
      const url    = editItem
        ? `/api/inventory/items/${editItem.id}`
        : '/api/inventory/items'

      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          description:      form.description || null,
          sku:              form.sku || null,
          barcode:          form.barcode || null,
          category:         form.category || null,
          supplier_name:    form.supplier_name || null,
          supplier_phone:   form.supplier_phone || null,
          supplier_email:   form.supplier_email || null,
          storage_location: form.storage_location || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Save failed'); return }

      if (editItem) {
        setItems((prev) => prev.map((i) => i.id === editItem.id ? data.item : i))
      } else {
        setItems((prev) => [data.item, ...prev])
      }
      setShowModal(false)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }, [form, editItem])

  async function handleDelete(item: InventoryItem) {
    if (!confirm(`Archive "${item.name}"?`)) return
    const res = await fetch(`/api/inventory/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    })
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== item.id))
  }

  async function handleAdjust() {
    if (!adjustItem || adjustDelta === 0) return
    setAdjusting(true)
    try {
      const res = await fetch('/api/inventory/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventory_item_id: adjustItem.id,
          movement_type:     'manual_adjustment',
          quantity_delta:    adjustDelta,
          reason:            adjustReason || 'Manual adjustment',
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setItems((prev) => prev.map((i) =>
          i.id === adjustItem.id ? { ...i, current_quantity: data.new_quantity } : i
        ))
        setAdjustItem(null)
        setAdjustDelta(0)
        setAdjustReason('')
      }
    } finally {
      setAdjusting(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-teal-400" />
            Inventory Items
          </h1>
          <p className="text-sm text-zinc-400 mt-1">{filtered.length} of {items.length} items</p>
        </div>
        {canEdit && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Item
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] rounded-xl border border-surface-border bg-graphite-800/50 px-3 py-2">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU, barcode..."
            className="bg-transparent text-sm text-white placeholder-zinc-400 outline-none flex-1"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-xl border border-surface-border bg-graphite-800/50 text-sm text-white px-3 py-2 outline-none"
        >
          <option value="">All Types</option>
          {ITEM_TYPES.map((t) => (
            <option key={t} value={t}>{ITEM_TYPE_LABELS[t]}</option>
          ))}
        </select>
        {categories.length > 0 && (
          <select
            value={filterCategory}
            onChange={(e) => setFilterCat(e.target.value)}
            className="rounded-xl border border-surface-border bg-graphite-800/50 text-sm text-white px-3 py-2 outline-none"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        <button
          onClick={() => setFilterLow((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
            filterLow
              ? 'border-orange-400/50 bg-orange-400/10 text-orange-400'
              : 'border-surface-border bg-graphite-800/50 text-zinc-400 hover:text-white'
          }`}
        >
          <AlertTriangle className="w-4 h-4" /> Low Stock
        </button>
      </div>

      {/* Mobile card / Desktop table */}
      <div className="hidden md:block rounded-2xl border border-surface-border bg-graphite-800/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-surface-border/70">
            <tr>
              <th className="text-left text-xs text-zinc-400 px-4 py-3">Name</th>
              <th className="text-left text-xs text-zinc-400 px-4 py-3">Type</th>
              <th className="text-left text-xs text-zinc-400 px-4 py-3">Category</th>
              <th className="text-right text-xs text-zinc-400 px-4 py-3">Qty</th>
              <th className="text-right text-xs text-zinc-400 px-4 py-3">Reorder At</th>
              <th className="text-left text-xs text-zinc-400 px-4 py-3">Status</th>
              <th className="text-right text-xs text-zinc-400 px-4 py-3">Value</th>
              {canEdit && <th className="text-right text-xs text-zinc-400 px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-zinc-400 py-10">No items found</td>
              </tr>
            )}
            {filtered.map((item) => (
              <tr key={item.id} className="border-b border-surface-border/30 last:border-0 hover:bg-graphite-700/30">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-white">{item.name}</p>
                    {item.sku && <p className="text-xs text-zinc-400">SKU: {item.sku}</p>}
                    {item.barcode && <p className="text-xs text-zinc-400">Bar: {item.barcode}</p>}
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-300 capitalize">{ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}</td>
                <td className="px-4 py-3 text-zinc-300">{item.category ?? '—'}</td>
                <td className="px-4 py-3 text-right font-mono font-medium text-white">
                  {item.current_quantity} <span className="text-zinc-400 text-xs">{item.unit}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-zinc-400">
                  {item.reorder_point} <span className="text-xs">{item.unit}</span>
                </td>
                <td className="px-4 py-3"><QuantityBadge item={item} /></td>
                <td className="px-4 py-3 text-right text-zinc-300">
                  {item.cost_per_unit
                    ? `$${(item.current_quantity * item.cost_per_unit).toFixed(2)}`
                    : '—'}
                </td>
                {canEdit && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setAdjustItem(item); setAdjustDelta(0); setAdjustReason('') }}
                        className="p-1.5 rounded-lg hover:bg-teal-400/10 text-teal-400 transition-colors"
                        title="Adjust quantity"
                      >
                        <SlidersHorizontal className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 rounded-lg hover:bg-zinc-600/50 text-zinc-400 hover:text-white transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="p-1.5 rounded-lg hover:bg-red-400/10 text-zinc-400 hover:text-red-400 transition-colors"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 && (
          <p className="text-center text-zinc-400 py-10">No items found</p>
        )}
        {filtered.map((item) => (
          <div key={item.id} className="rounded-2xl border border-surface-border bg-graphite-800/50 p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <p className="font-semibold text-white">{item.name}</p>
                {item.category && <p className="text-xs text-zinc-400">{item.category}</p>}
              </div>
              <QuantityBadge item={item} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div>
                <p className="text-xs text-zinc-400">Quantity</p>
                <p className="font-mono font-medium text-white">{item.current_quantity} {item.unit}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Reorder At</p>
                <p className="font-mono text-zinc-300">{item.reorder_point} {item.unit}</p>
              </div>
            </div>
            {canEdit && (
              <div className="flex gap-2 pt-2 border-t border-surface-border/50">
                <button
                  onClick={() => { setAdjustItem(item); setAdjustDelta(0); setAdjustReason('') }}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-teal-500/10 text-teal-400 text-xs font-medium"
                >
                  <SlidersHorizontal className="w-3 h-3" /> Adjust
                </button>
                <button
                  onClick={() => openEdit(item)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-zinc-700/50 text-zinc-300 text-xs font-medium"
                >
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-surface-border bg-graphite-900 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-surface-border">
              <h2 className="text-lg font-semibold text-white">{editItem ? 'Edit Item' : 'Add Inventory Item'}</h2>
              <button onClick={() => setShowModal(false)} className="text-zinc-400 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              {error && (
                <div className="rounded-lg bg-red-400/10 border border-red-400/30 px-3 py-2 text-sm text-red-400">{error}</div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs text-zinc-400 mb-1 block">Name *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none focus:border-teal-400/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Type</label>
                  <select
                    value={form.item_type}
                    onChange={(e) => setForm((f) => ({ ...f, item_type: e.target.value as InventoryItemType }))}
                    className="w-full rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none"
                  >
                    {ITEM_TYPES.map((t) => <option key={t} value={t}>{ITEM_TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Unit</label>
                  <input
                    value={form.unit}
                    onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="unit, kg, L, pcs..."
                    className="w-full rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none focus:border-teal-400/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">SKU</label>
                  <input
                    value={form.sku}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                    className="w-full rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none focus:border-teal-400/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Barcode</label>
                  <input
                    value={form.barcode}
                    onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                    className="w-full rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none focus:border-teal-400/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Category</label>
                  <input
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="Ingredients, Packaging..."
                    className="w-full rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none focus:border-teal-400/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Current Qty</label>
                  <input
                    type="number"
                    value={form.current_quantity}
                    onChange={(e) => setForm((f) => ({ ...f, current_quantity: parseFloat(e.target.value) || 0 }))}
                    className="w-full rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none focus:border-teal-400/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Reorder Point</label>
                  <input
                    type="number"
                    value={form.reorder_point}
                    onChange={(e) => setForm((f) => ({ ...f, reorder_point: parseFloat(e.target.value) || 0 }))}
                    className="w-full rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none focus:border-teal-400/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Target Qty</label>
                  <input
                    type="number"
                    value={form.target_quantity ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, target_quantity: e.target.value ? parseFloat(e.target.value) : null }))}
                    className="w-full rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none focus:border-teal-400/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Cost Per Unit ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.cost_per_unit ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, cost_per_unit: e.target.value ? parseFloat(e.target.value) : null }))}
                    className="w-full rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none focus:border-teal-400/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Storage Location</label>
                  <input
                    value={form.storage_location}
                    onChange={(e) => setForm((f) => ({ ...f, storage_location: e.target.value }))}
                    placeholder="Shelf A, Freezer, etc."
                    className="w-full rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none focus:border-teal-400/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Supplier Name</label>
                  <input
                    value={form.supplier_name}
                    onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))}
                    className="w-full rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none focus:border-teal-400/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Supplier Phone</label>
                  <input
                    value={form.supplier_phone}
                    onChange={(e) => setForm((f) => ({ ...f, supplier_phone: e.target.value }))}
                    className="w-full rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none focus:border-teal-400/50"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-zinc-400 mb-1 block">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className="w-full rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none focus:border-teal-400/50 resize-none"
                  />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_sellable"
                    checked={form.is_sellable}
                    onChange={(e) => setForm((f) => ({ ...f, is_sellable: e.target.checked }))}
                    className="rounded"
                  />
                  <label htmlFor="is_sellable" className="text-sm text-zinc-300">
                    This item is sellable (linked to Store products)
                  </label>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-surface-border">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl border border-surface-border text-zinc-300 hover:text-white text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : editItem ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Adjust Modal */}
      {adjustItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-graphite-900 shadow-2xl p-5">
            <h2 className="text-lg font-semibold text-white mb-1">Adjust Quantity</h2>
            <p className="text-sm text-zinc-400 mb-5">{adjustItem.name} — Current: {adjustItem.current_quantity} {adjustItem.unit}</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Adjustment (+ or −)</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAdjustDelta((d) => d - 1)}
                    className="p-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    value={adjustDelta}
                    onChange={(e) => setAdjustDelta(parseFloat(e.target.value) || 0)}
                    className="flex-1 rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-center font-mono outline-none"
                  />
                  <button
                    onClick={() => setAdjustDelta((d) => d + 1)}
                    className="p-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  New quantity: {adjustItem.current_quantity + adjustDelta} {adjustItem.unit}
                </p>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Reason</label>
                <input
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Restock, consumed, damaged..."
                  className="w-full rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setAdjustItem(null)}
                className="flex-1 py-2 rounded-xl border border-surface-border text-zinc-300 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAdjust}
                disabled={adjusting || adjustDelta === 0}
                className="flex-1 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-white text-sm font-medium disabled:opacity-50"
              >
                {adjusting ? 'Saving...' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
