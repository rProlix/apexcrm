'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { ShoppingCart, Search, Plus, X, ChevronDown, ChevronUp, User, Receipt, Utensils, Settings, List } from 'lucide-react'
import { formatCents, calculateOrder } from '@/lib/pos/calculateOrder'
import type { CartItem, CartModifierSelection, POSProduct, POSSettings, POSModifierGroup, POSDiscount } from '@/lib/pos/types'
import { ItemCustomizerModal } from './ItemCustomizerModal'
import { CheckoutModal } from './CheckoutModal'
import { CustomerSelector } from './CustomerSelector'

interface Props {
  tenantId:             string
  userId:               string
  userRole:             string
  initialProducts:      Record<string, unknown>[]
  initialSettings:      Record<string, unknown> | null
  initialModifierGroups: Record<string, unknown>[]
  initialShift:         Record<string, unknown> | null
  initialRegisters:     Record<string, unknown>[]
  initialDiscounts:     Record<string, unknown>[]
}

interface Customer {
  id:   string
  name: string
  email?: string | null
  phone?: string | null
}

export function POSScreen({
  tenantId, userId, userRole, initialProducts, initialSettings,
  initialModifierGroups, initialShift, initialRegisters, initialDiscounts,
}: Props) {
  const settings = initialSettings as POSSettings | null
  const [cart, setCart]             = useState<CartItem[]>([])
  const [search, setSearch]         = useState('')
  const [activeCategory, setCategory] = useState<string | null>(null)
  const [customizingItem, setCustomizingItem] = useState<POSProduct | null>(null)
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null)
  const [showCheckout, setShowCheckout]       = useState(false)
  const [showCart, setShowCart]               = useState(false)      // mobile drawer
  const [showCustomers, setShowCustomers]     = useState(false)
  const [customer, setCustomer]               = useState<Customer | null>(null)
  const [orderType, setOrderType]             = useState<string>('in_person')
  const [tableName, setTableName]             = useState('')
  const [guestCount, setGuestCount]           = useState<number | ''>('')
  const [globalDiscount, setGlobalDiscount]   = useState<{ type: 'percent' | 'fixed_amount'; value: number } | null>(null)
  const [isSubmitting, setIsSubmitting]       = useState(false)
  const [error, setError]                     = useState<string | null>(null)
  const cartRef = useRef<HTMLDivElement>(null)

  const products       = initialProducts as unknown as POSProduct[]
  const discounts      = initialDiscounts as unknown as POSDiscount[]
  const activeShift    = initialShift

  const categories = useMemo(() => {
    const cats = [...new Set(products.map((p) => p.category).filter(Boolean))] as string[]
    return cats.sort()
  }, [products])

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch   = !search || p.name.toLowerCase().includes(search.toLowerCase())
      const matchesCategory = !activeCategory || p.category === activeCategory
      return matchesSearch && matchesCategory
    })
  }, [products, search, activeCategory])

  const calc = useMemo(() => calculateOrder({
    items:     cart,
    discount:  globalDiscount,
    tip_cents: 0,
    settings:  settings ?? { default_tax_rate: 0, service_fee_enabled: false, service_fee_percent: 0, tips_enabled: true },
  }), [cart, globalDiscount, settings])

  const addToCart = useCallback((item: CartItem) => {
    setCart((prev) => [...prev, item])
  }, [])

  const updateCartItem = useCallback((cartKey: string, updates: Partial<CartItem>) => {
    setCart((prev) => prev.map((i) => i.cart_key === cartKey ? { ...i, ...updates } : i))
  }, [])

  const removeFromCart = useCallback((cartKey: string) => {
    setCart((prev) => prev.filter((i) => i.cart_key !== cartKey))
  }, [])

  const clearCart = () => { setCart([]); setCustomer(null); setGlobalDiscount(null); setTableName(''); setGuestCount('') }

  const handleProductClick = (product: POSProduct) => {
    // If no modifiers and notes not required, add directly
    if (product.modifier_groups.length === 0 && !settings?.allow_item_notes) {
      addToCart({
        cart_key:         crypto.randomUUID(),
        product_id:       product.id,
        name:             product.name,
        item_type:        'product',
        quantity:         1,
        unit_price_cents: product.price_cents,
        modifiers:        [],
        notes:            '',
        kitchen_notes:    '',
        taxable:          true,
        tax_rate:         null,
      })
    } else {
      setCustomizingItem(product)
    }
  }

  const handleSaveTicket = async () => {
    if (cart.length === 0) { setError('Add items to the order first'); return }
    setIsSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/pos/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items:               cart,
          discount:            globalDiscount,
          status:              'open',
          order_type:          orderType,
          table_name:          tableName || null,
          guest_count:         guestCount || null,
          customer_id:         customer?.id ?? null,
          shift_id:            activeShift?.id ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to save ticket'); return }
      window.location.href = `/pos/orders/${data.order.id}`
    } catch { setError('Network error') } finally { setIsSubmitting(false) }
  }

  const handleCheckout = () => {
    if (cart.length === 0) { setError('Add items first'); return }
    setShowCheckout(true)
  }

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-zinc-950">
      {/* Top bar */}
      <div className="flex-none flex items-center gap-3 px-4 py-3 bg-zinc-900 border-b border-zinc-800">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
          <input
            type="text"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
          />
        </div>

        <select
          value={orderType}
          onChange={(e) => setOrderType(e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
        >
          <option value="in_person">In-Person</option>
          <option value="dine_in">Dine-In</option>
          <option value="takeout">Takeout</option>
          <option value="pickup">Pickup</option>
          <option value="delivery">Delivery</option>
        </select>

        {(orderType === 'dine_in' || orderType === 'in_person') && (
          <input
            type="text"
            placeholder="Table / #"
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            className="w-24 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
          />
        )}

        <button
          onClick={() => setShowCustomers(true)}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:border-violet-500 transition-colors"
        >
          <User className="w-4 h-4" />
          {customer ? customer.name : 'Customer'}
        </button>

        {/* Mobile cart button */}
        <button
          onClick={() => setShowCart(true)}
          className="lg:hidden relative flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm text-white transition-colors"
        >
          <ShoppingCart className="w-4 h-4" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-yellow-400 text-zinc-900 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Category tabs */}
      {categories.length > 0 && (
        <div className="flex-none flex gap-2 px-4 py-2 overflow-x-auto bg-zinc-900 border-b border-zinc-800 scrollbar-hide">
          <button
            onClick={() => setCategory(null)}
            className={`flex-none px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${!activeCategory ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(activeCategory === cat ? null : cat)}
              className={`flex-none px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeCategory === cat ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
          )}

          {/* Custom item button */}
          {settings?.allow_custom_items !== false && (
            <div className="mb-4">
              <button
                onClick={() => {
                  const name = prompt('Custom item name:')
                  const priceStr = prompt('Price (e.g. 9.99):')
                  if (!name || !priceStr) return
                  const priceCents = Math.round(parseFloat(priceStr) * 100)
                  addToCart({
                    cart_key:         crypto.randomUUID(),
                    product_id:       null,
                    name,
                    item_type:        'custom',
                    quantity:         1,
                    unit_price_cents: isNaN(priceCents) ? 0 : priceCents,
                    modifiers:        [],
                    notes:            '',
                    kitchen_notes:    '',
                    taxable:          true,
                    tax_rate:         null,
                  })
                }}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-dashed border-zinc-600 rounded-lg text-sm text-zinc-400 hover:text-violet-400 hover:border-violet-500 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Custom Item
              </button>
            </div>
          )}

          {filteredProducts.length === 0 ? (
            <div className="text-center py-20 text-zinc-500">No products found</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts.map((product) => {
                const outOfStock = product.inventory_count <= 0 && product.inventory_count !== undefined && product.inventory_count !== null
                const lowStock   = product.inventory_count > 0 && product.inventory_count <= 5

                return (
                  <button
                    key={product.id}
                    onClick={() => !outOfStock && handleProductClick(product)}
                    disabled={outOfStock}
                    className={`relative flex flex-col p-3 rounded-xl border text-left transition-all ${
                      outOfStock
                        ? 'bg-zinc-900 border-zinc-800 opacity-50 cursor-not-allowed'
                        : 'bg-zinc-900 border-zinc-700 hover:border-violet-500 hover:bg-zinc-800 active:scale-95'
                    }`}
                  >
                    {/* Stock badge */}
                    {lowStock && !outOfStock && (
                      <span className="absolute top-2 right-2 text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">
                        Low
                      </span>
                    )}
                    {outOfStock && (
                      <span className="absolute top-2 right-2 text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                        Out
                      </span>
                    )}

                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full aspect-square object-cover rounded-lg mb-2 bg-zinc-800" />
                    ) : (
                      <div className="w-full aspect-square rounded-lg mb-2 bg-zinc-800 flex items-center justify-center">
                        <ShoppingCart className="w-8 h-8 text-zinc-600" />
                      </div>
                    )}

                    <p className="text-sm font-medium text-zinc-100 line-clamp-2 leading-tight">{product.name}</p>
                    {product.category && (
                      <p className="text-xs text-zinc-500 mt-0.5">{product.category}</p>
                    )}
                    <p className="text-sm font-bold text-violet-400 mt-1.5">{formatCents(product.price_cents)}</p>

                    {product.modifier_groups.length > 0 && (
                      <p className="text-xs text-zinc-600 mt-1">Customizable</p>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Cart panel — desktop */}
        <div className="hidden lg:flex w-96 flex-col border-l border-zinc-800 bg-zinc-900">
          <CartPanel
            cart={cart}
            calc={calc}
            discounts={discounts}
            customer={customer}
            globalDiscount={globalDiscount}
            settings={settings}
            onRemove={removeFromCart}
            onEdit={(item) => { setEditingCartItem(item); setCustomizingItem(products.find((p) => p.id === item.product_id) ?? null) }}
            onUpdateQty={(key, qty) => qty <= 0 ? removeFromCart(key) : updateCartItem(key, { quantity: qty })}
            onSetDiscount={setGlobalDiscount}
            onClearCart={clearCart}
            onSaveTicket={handleSaveTicket}
            onCheckout={handleCheckout}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>

      {/* Mobile cart drawer */}
      {showCart && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCart(false)} />
          <div className="relative bg-zinc-900 rounded-t-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-100">Order</h2>
              <button onClick={() => setShowCart(false)}><X className="w-5 h-5 text-zinc-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <CartPanel
                cart={cart}
                calc={calc}
                discounts={discounts}
                customer={customer}
                globalDiscount={globalDiscount}
                settings={settings}
                onRemove={removeFromCart}
                onEdit={(item) => { setEditingCartItem(item); setCustomizingItem(products.find((p) => p.id === item.product_id) ?? null); setShowCart(false) }}
                onUpdateQty={(key, qty) => qty <= 0 ? removeFromCart(key) : updateCartItem(key, { quantity: qty })}
                onSetDiscount={setGlobalDiscount}
                onClearCart={clearCart}
                onSaveTicket={handleSaveTicket}
                onCheckout={() => { setShowCart(false); handleCheckout() }}
                isSubmitting={isSubmitting}
              />
            </div>
          </div>
        </div>
      )}

      {/* Item customizer modal */}
      {customizingItem && (
        <ItemCustomizerModal
          product={customizingItem}
          editingItem={editingCartItem}
          settings={settings}
          onConfirm={(item) => {
            if (editingCartItem) {
              updateCartItem(editingCartItem.cart_key, item)
            } else {
              addToCart({ ...item, cart_key: crypto.randomUUID() })
            }
            setCustomizingItem(null)
            setEditingCartItem(null)
          }}
          onClose={() => { setCustomizingItem(null); setEditingCartItem(null) }}
        />
      )}

      {/* Checkout modal */}
      {showCheckout && (
        <CheckoutModal
          cart={cart}
          calc={calc}
          customer={customer}
          orderType={orderType}
          tableName={tableName}
          guestCount={guestCount as number}
          globalDiscount={globalDiscount}
          settings={settings}
          shiftId={activeShift?.id as string | null}
          onSuccess={() => { clearCart(); setShowCheckout(false); window.location.href = '/pos/orders' }}
          onClose={() => setShowCheckout(false)}
        />
      )}

      {/* Customer selector */}
      {showCustomers && (
        <CustomerSelector
          tenantId={tenantId}
          selected={customer}
          onSelect={(c) => { setCustomer(c); setShowCustomers(false) }}
          onClose={() => setShowCustomers(false)}
        />
      )}

      {/* Mobile floating cart button when cart has items */}
      {cart.length > 0 && !showCart && !showCheckout && (
        <div className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={() => setShowCart(true)}
            className="flex items-center gap-3 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl shadow-2xl transition-all"
          >
            <ShoppingCart className="w-5 h-5" />
            <span className="font-semibold">{cartCount} items</span>
            <span className="text-violet-200">·</span>
            <span className="font-bold">{formatCents(calc.total_cents)}</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ── Cart Panel ─────────────────────────────────────────────────────────────────

interface CartPanelProps {
  cart:           CartItem[]
  calc:           ReturnType<typeof calculateOrder>
  discounts:      POSDiscount[]
  customer:       { id: string; name: string } | null
  globalDiscount: { type: 'percent' | 'fixed_amount'; value: number } | null
  settings:       POSSettings | null
  onRemove:       (key: string) => void
  onEdit:         (item: CartItem) => void
  onUpdateQty:    (key: string, qty: number) => void
  onSetDiscount:  (d: { type: 'percent' | 'fixed_amount'; value: number } | null) => void
  onClearCart:    () => void
  onSaveTicket:   () => void
  onCheckout:     () => void
  isSubmitting:   boolean
}

function CartPanel({ cart, calc, discounts, customer, globalDiscount, settings, onRemove, onEdit, onUpdateQty, onSetDiscount, onClearCart, onSaveTicket, onCheckout, isSubmitting }: CartPanelProps) {
  const [showDiscounts, setShowDiscounts] = useState(false)

  if (cart.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-600 p-8">
        <ShoppingCart className="w-12 h-12" />
        <p className="text-sm">Add items to start an order</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold text-zinc-100">Order</span>
          {customer && <span className="text-xs text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">{customer.name}</span>}
        </div>
        <button onClick={onClearCart} className="text-xs text-zinc-500 hover:text-red-400 transition-colors">Clear</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {cart.map((item, idx) => {
          const itemCalc = calc.items[idx]
          return (
            <div key={item.cart_key} className="bg-zinc-800/50 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">{item.name}</p>
                  {item.modifiers.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {item.modifiers.map((m, mi) => (
                        <p key={mi} className="text-xs text-zinc-400">
                          {m.modifier_type === 'removal' ? '— ' : '+ '}{m.name}
                          {m.price_delta_cents !== 0 && ` (${m.price_delta_cents > 0 ? '+' : ''}${formatCents(m.price_delta_cents)})`}
                        </p>
                      ))}
                    </div>
                  )}
                  {item.notes && <p className="text-xs text-zinc-500 mt-1 italic">Note: {item.notes}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="text-sm font-bold text-violet-400">{itemCalc ? formatCents(itemCalc.total_cents) : ''}</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => onUpdateQty(item.cart_key, item.quantity - 1)} className="w-6 h-6 flex items-center justify-center bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300 text-sm transition-colors">−</button>
                    <span className="w-6 text-center text-sm text-zinc-200">{item.quantity}</span>
                    <button onClick={() => onUpdateQty(item.cart_key, item.quantity + 1)} className="w-6 h-6 flex items-center justify-center bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300 text-sm transition-colors">+</button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button onClick={() => onEdit(item)} className="text-xs text-zinc-500 hover:text-violet-400 transition-colors">Edit</button>
                <span className="text-zinc-700">·</span>
                <button onClick={() => onRemove(item.cart_key)} className="text-xs text-zinc-500 hover:text-red-400 transition-colors">Remove</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Totals */}
      <div className="border-t border-zinc-800 p-4 space-y-2">
        {/* Discount */}
        {settings?.allow_discounts !== false && (
          <div>
            {globalDiscount ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">
                  Discount ({globalDiscount.type === 'percent' ? `${globalDiscount.value}%` : formatCents(globalDiscount.value)})
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-green-400">−{formatCents(calc.discount_cents)}</span>
                  <button onClick={() => onSetDiscount(null)} className="text-zinc-600 hover:text-red-400"><X className="w-3 h-3" /></button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowDiscounts(!showDiscounts)}
                className="text-xs text-zinc-500 hover:text-violet-400 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Discount
              </button>
            )}
            {showDiscounts && !globalDiscount && (
              <div className="mt-2 space-y-1">
                {discounts.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { onSetDiscount({ type: d.discount_type, value: d.discount_type === 'fixed_amount' ? d.value * 100 : d.value }); setShowDiscounts(false) }}
                    className="w-full text-left px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-sm text-zinc-300 transition-colors"
                  >
                    {d.name} — {d.discount_type === 'percent' ? `${d.value}%` : formatCents(d.value * 100)}
                  </button>
                ))}
                <button
                  onClick={() => {
                    const val = prompt('Discount % (e.g. 10):')
                    if (val) { onSetDiscount({ type: 'percent', value: parseFloat(val) }); setShowDiscounts(false) }
                  }}
                  className="w-full text-left px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-sm text-zinc-400 transition-colors"
                >
                  Custom %…
                </button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-zinc-400">
            <span>Subtotal</span><span>{formatCents(calc.subtotal_cents)}</span>
          </div>
          {calc.discount_cents > 0 && (
            <div className="flex justify-between text-green-400">
              <span>Discount</span><span>−{formatCents(calc.discount_cents)}</span>
            </div>
          )}
          {calc.tax_cents > 0 && (
            <div className="flex justify-between text-zinc-400">
              <span>Tax</span><span>{formatCents(calc.tax_cents)}</span>
            </div>
          )}
          {calc.service_fee_cents > 0 && (
            <div className="flex justify-between text-zinc-400">
              <span>Service Fee</span><span>{formatCents(calc.service_fee_cents)}</span>
            </div>
          )}
        </div>

        <div className="flex justify-between text-base font-bold text-zinc-100 border-t border-zinc-800 pt-2 mt-2">
          <span>Total</span>
          <span className="text-violet-400">{formatCents(calc.total_cents)}</span>
        </div>

        <div className="flex gap-2 mt-3">
          <button
            onClick={onSaveTicket}
            disabled={isSubmitting}
            className="flex-1 px-3 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-200 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            Save Ticket
          </button>
          <button
            onClick={onCheckout}
            disabled={isSubmitting}
            className="flex-1 px-3 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
          >
            Checkout →
          </button>
        </div>
      </div>
    </div>
  )
}
