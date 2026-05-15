// lib/pos/types.ts
// TypeScript types for the full POS module.

export type POSOrderStatus =
  | 'draft' | 'open' | 'sent_to_kitchen' | 'preparing' | 'ready'
  | 'completed' | 'cancelled' | 'refunded' | 'partially_refunded'

export type POSPaymentStatus =
  | 'unpaid' | 'partially_paid' | 'paid' | 'refunded' | 'partially_refunded' | 'failed'

export type POSFulfillmentStatus =
  | 'not_started' | 'preparing' | 'ready' | 'fulfilled' | 'cancelled'

export type POSOrderType =
  | 'in_person' | 'dine_in' | 'takeout' | 'pickup' | 'delivery' | 'appointment' | 'custom'

export type POSChannel =
  | 'pos' | 'online' | 'phone' | 'kiosk' | 'delivery' | 'pickup'

export type POSPaymentMethod =
  | 'cash' | 'card' | 'tap' | 'manual_card' | 'gift_card' | 'store_credit' | 'split' | 'other'

export type POSPaymentProvider =
  | 'manual' | 'stripe' | 'square' | 'cash' | 'external' | 'gift_card' | 'split'

export type POSModifierType =
  | 'addon' | 'removal' | 'substitution' | 'instruction' | 'preparation'

export type POSItemType = 'product' | 'service' | 'custom' | 'fee' | 'discount'

export type POSKitchenStatus = 'new' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'cancelled'

export type POSDiscountType = 'percent' | 'fixed_amount'

export type POSDeductionTiming = 'order_created' | 'sent_to_kitchen' | 'payment_completed' | 'order_completed'

// ── Core entities ──────────────────────────────────────────────────────────────

export interface POSRegister {
  id:                     string
  tenant_id:              string
  name:                   string
  location_name:          string | null
  register_code:          string | null
  status:                 'active' | 'inactive' | 'archived'
  cash_tracking_enabled:  boolean
  starting_cash_cents:    number
  current_cash_cents:     number
  created_by:             string | null
  created_at:             string
  updated_at:             string
}

export interface POSShift {
  id:                     string
  tenant_id:              string
  register_id:            string | null
  opened_by:              string
  closed_by:              string | null
  status:                 'open' | 'closed' | 'cancelled'
  opened_at:              string
  closed_at:              string | null
  starting_cash_cents:    number
  expected_cash_cents:    number
  counted_cash_cents:     number | null
  cash_difference_cents:  number | null
  notes:                  string | null
  created_at:             string
  updated_at:             string
}

export interface POSOrder {
  id:                   string
  tenant_id:            string
  order_number:         string
  channel:              POSChannel
  order_type:           POSOrderType
  status:               POSOrderStatus
  payment_status:       POSPaymentStatus
  fulfillment_status:   POSFulfillmentStatus
  customer_id:          string | null
  customer_account_id:  string | null
  register_id:          string | null
  shift_id:             string | null
  appointment_id:       string | null
  table_name:           string | null
  guest_count:          number | null
  cashier_user_id:      string | null
  assigned_employee_id: string | null
  subtotal_cents:       number
  discount_cents:       number
  tax_cents:            number
  tip_cents:            number
  service_fee_cents:    number
  total_cents:          number
  amount_paid_cents:    number
  balance_due_cents:    number
  currency:             string
  notes:                string | null
  internal_notes:       string | null
  kitchen_notes:        string | null
  source_metadata:      Record<string, unknown>
  created_by:           string | null
  completed_at:         string | null
  cancelled_at:         string | null
  refunded_at:          string | null
  created_at:           string
  updated_at:           string
  // Joined
  items?:               POSOrderItem[]
  payments?:            POSPayment[]
  customer_name?:       string | null
}

export interface POSOrderItem {
  id:                   string
  tenant_id:            string
  order_id:             string
  product_id:           string | null
  inventory_item_id:    string | null
  name:                 string
  sku:                  string | null
  item_type:            POSItemType
  quantity:             number
  unit_price_cents:     number
  base_price_cents:     number
  modifier_total_cents: number
  discount_cents:       number
  tax_cents:            number
  total_cents:          number
  taxable:              boolean
  tax_rate:             number | null
  fulfillment_status:   POSFulfillmentStatus
  notes:                string | null
  kitchen_notes:        string | null
  sort_order:           number
  created_at:           string
  updated_at:           string
  modifiers?:           POSOrderItemModifier[]
}

export interface POSOrderItemModifier {
  id:                 string
  tenant_id:          string
  order_item_id:      string
  modifier_group_id:  string | null
  modifier_id:        string | null
  name:               string
  modifier_type:      POSModifierType
  quantity:           number
  price_delta_cents:  number
  total_cents:        number
  inventory_item_id:  string | null
  affects_inventory:  boolean
  quantity_delta:     number
  notes:              string | null
  created_at:         string
}

export interface POSModifierGroup {
  id:                       string
  tenant_id:                string
  name:                     string
  description:              string | null
  selection_type:           'single' | 'multiple'
  min_required:             number
  max_allowed:              number | null
  is_required:              boolean
  applies_to_all_products:  boolean
  status:                   'active' | 'inactive' | 'archived'
  sort_order:               number
  created_at:               string
  updated_at:               string
  modifiers?:               POSModifier[]
}

export interface POSModifier {
  id:                 string
  tenant_id:          string
  modifier_group_id:  string
  name:               string
  modifier_type:      POSModifierType
  price_delta_cents:  number
  inventory_item_id:  string | null
  affects_inventory:  boolean
  quantity_delta:     number
  is_default:         boolean
  status:             'active' | 'inactive' | 'archived'
  sort_order:         number
  created_at:         string
  updated_at:         string
}

export interface POSPayment {
  id:                     string
  tenant_id:              string
  order_id:               string
  payment_provider:       POSPaymentProvider
  payment_method:         POSPaymentMethod
  status:                 'pending' | 'authorized' | 'paid' | 'failed' | 'refunded' | 'partially_refunded' | 'cancelled'
  amount_cents:           number
  tip_cents:              number
  currency:               string
  provider_payment_id:    string | null
  provider_checkout_url:  string | null
  provider_response:      Record<string, unknown>
  collected_by:           string | null
  paid_at:                string | null
  refunded_at:            string | null
  created_at:             string
  updated_at:             string
}

export interface POSKitchenTicket {
  id:           string
  tenant_id:    string
  order_id:     string
  status:       POSKitchenStatus
  station:      string | null
  sent_at:      string
  accepted_at:  string | null
  ready_at:     string | null
  completed_at: string | null
  notes:        string | null
  created_at:   string
  updated_at:   string
  order_number?: string
  items?:        POSOrderItem[]
}

export interface POSSettings {
  id:                             string
  tenant_id:                      string
  default_tax_rate:               number
  tips_enabled:                   boolean
  service_fee_enabled:            boolean
  service_fee_percent:            number
  require_customer_for_order:     boolean
  allow_custom_items:             boolean
  allow_item_notes:               boolean
  allow_kitchen_notes:            boolean
  allow_discounts:                boolean
  manager_approval_for_discounts: boolean
  inventory_deduction_timing:     POSDeductionTiming
  order_number_prefix:            string
  next_order_number:              number
  receipt_branding:               Record<string, unknown>
  created_at:                     string
  updated_at:                     string
}

export interface POSDiscount {
  id:                         string
  tenant_id:                  string
  name:                       string
  discount_type:              POSDiscountType
  value:                      number
  applies_to:                 'order' | 'item'
  requires_manager_approval:  boolean
  status:                     'active' | 'inactive' | 'archived'
  created_at:                 string
  updated_at:                 string
}

// ── Cart types (client-side only, not stored) ──────────────────────────────────

export interface CartModifierSelection {
  modifier_group_id:  string
  modifier_id:        string
  name:               string
  modifier_type:      POSModifierType
  price_delta_cents:  number
  quantity:           number
  inventory_item_id:  string | null
  affects_inventory:  boolean
  quantity_delta:     number
}

export interface CartItem {
  cart_key:             string           // local unique key
  product_id:           string | null
  name:                 string
  item_type:            POSItemType
  quantity:             number
  unit_price_cents:     number
  modifiers:            CartModifierSelection[]
  notes:                string
  kitchen_notes:        string
  taxable:              boolean
  tax_rate:             number | null
}

// ── Calculation result ─────────────────────────────────────────────────────────

export interface OrderCalculation {
  items: Array<{
    cart_key:             string
    base_price_cents:     number
    modifier_total_cents: number
    unit_price_with_mods: number
    subtotal_cents:       number
    discount_cents:       number
    tax_cents:            number
    total_cents:          number
  }>
  subtotal_cents:     number
  discount_cents:     number
  tax_cents:          number
  tip_cents:          number
  service_fee_cents:  number
  total_cents:        number
  amount_paid_cents:  number
  balance_due_cents:  number
}

// ── POS product (for grid display) ────────────────────────────────────────────

export interface POSProduct {
  id:              string
  name:            string
  description:     string | null
  price_cents:     number
  price:           number
  currency:        string
  category:        string | null
  image_url:       string | null
  inventory_count: number
  is_active:       boolean
  modifier_groups: POSModifierGroup[]
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface POSAnalytics {
  sales_today_cents:  number
  sales_week_cents:   number
  sales_month_cents:  number
  order_count:        number
  avg_order_cents:    number
  top_items:          Array<{ name: string; total_qty: number; total_revenue: number }>
  payment_methods:    Array<{ payment_method: string; count: number; total: number }>
}
