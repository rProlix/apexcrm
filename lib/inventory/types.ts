// lib/inventory/types.ts
// Clean TypeScript types for the Inventory Module.
// Separate from Store module types — inventory tracks both sellable
// and non-sellable business assets.

export type InventoryItemType =
  | 'supply'
  | 'ingredient'
  | 'material'
  | 'retail_stock'
  | 'tool'
  | 'equipment'
  | 'packaging'
  | 'utensil'
  | 'cleaning'
  | 'other'

export type MovementType =
  | 'manual_adjustment'
  | 'sale'
  | 'return'
  | 'restock'
  | 'waste'
  | 'damage'
  | 'transfer'
  | 'count_correction'
  | 'barcode_scan'
  | 'system_prediction'
  | 'other'

export type AlertType =
  | 'low_stock'
  | 'out_of_stock'
  | 'predicted_stockout'
  | 'overstock'
  | 'stale_inventory'
  | 'manual'

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical'
export type AlertStatus   = 'open' | 'acknowledged' | 'resolved' | 'dismissed'

export type ScanAction =
  | 'lookup'
  | 'restock'
  | 'consume'
  | 'adjust'
  | 'count'
  | 'link_item'
  | 'create_item'

export type BarcodeMode = 'camera' | 'manual' | 'both'

// ── Core entities ──────────────────────────────────────────────────────────────

export interface InventoryItem {
  id:                 string
  tenant_id:          string
  name:               string
  description:        string | null
  sku:                string | null
  barcode:            string | null
  category:           string | null
  item_type:          InventoryItemType
  unit:               string
  current_quantity:   number
  reorder_point:      number
  target_quantity:    number | null
  cost_per_unit:      number | null
  supplier_name:      string | null
  supplier_url:       string | null
  supplier_phone:     string | null
  supplier_email:     string | null
  storage_location:   string | null
  image_url:          string | null
  is_active:          boolean
  is_sellable:        boolean
  linked_product_id:  string | null
  metadata:           Record<string, unknown>
  created_by:         string | null
  created_at:         string
  updated_at:         string
}

export interface InventoryMovement {
  id:                 string
  tenant_id:          string
  inventory_item_id:  string
  movement_type:      MovementType
  quantity_delta:     number
  quantity_before:    number | null
  quantity_after:     number | null
  reason:             string | null
  source_type:        string | null
  source_id:          string | null
  order_id:           string | null
  product_id:         string | null
  scanned_barcode:    string | null
  notes:              string | null
  created_by:         string | null
  created_at:         string
  // Joined fields (optional)
  item_name?:         string
  unit?:              string
}

export interface InventoryAlert {
  id:                         string
  tenant_id:                  string
  inventory_item_id:          string
  alert_type:                 AlertType
  severity:                   AlertSeverity
  title:                      string
  message:                    string | null
  status:                     AlertStatus
  recommended_order_quantity: number | null
  predicted_stockout_at:      string | null
  sales_velocity_daily:       number | null
  metadata:                   Record<string, unknown>
  created_at:                 string
  resolved_at:                string | null
  resolved_by:                string | null
  // Joined
  item_name?:                 string
  item_unit?:                 string
  current_quantity?:          number
}

export interface InventoryScanEvent {
  id:                 string
  tenant_id:          string
  barcode:            string
  inventory_item_id:  string | null
  scan_action:        ScanAction
  quantity:           number
  result:             string | null
  metadata:           Record<string, unknown>
  created_by:         string | null
  created_at:         string
  // Joined
  item_name?:         string
}

export interface InventorySettings {
  id:                         string
  tenant_id:                  string
  low_stock_alerts_enabled:   boolean
  prediction_alerts_enabled:  boolean
  default_prediction_days:    number
  barcode_mode:               BarcodeMode
  auto_create_alerts:         boolean
  notify_email:               boolean
  notify_dashboard:           boolean
  settings:                   Record<string, unknown>
  created_at:                 string
  updated_at:                 string
}

export interface ProductInventoryLink {
  id:                   string
  tenant_id:            string
  product_id:           string
  inventory_item_id:    string
  quantity_per_product: number
  deduct_on_sale:       boolean
  created_at:           string
  updated_at:           string
  // Joined
  item_name?:           string
  item_unit?:           string
  current_quantity?:    number
  product_name?:        string
}

// ── Dashboard / analytics ──────────────────────────────────────────────────────

export interface InventoryDashboardStats {
  total_items:               number
  low_stock_count:           number
  out_of_stock_count:        number
  open_alerts_count:         number
  estimated_inventory_value: number
  top_consumed_items:        Array<{
    id:             string
    name:           string
    unit:           string
    total_consumed: number
  }>
  recent_movements: Array<{
    id:            string
    movement_type: MovementType
    quantity_delta: number
    quantity_after: number | null
    reason:        string | null
    created_at:    string
    item_name:     string
    unit:          string
  }>
}

export interface InventoryPrediction {
  item_id:                    string
  item_name:                  string
  current_quantity:           number
  unit:                       string
  sales_velocity_daily_7d:    number | null
  sales_velocity_daily_30d:   number | null
  blended_velocity_daily:     number | null
  estimated_days_remaining:   number | null
  predicted_stockout_at:      string | null  // ISO date
  suggested_reorder_quantity: number | null
  confidence:                 'high' | 'medium' | 'low' | 'insufficient_data'
}

export interface InventoryTrendSummary {
  top_store_products_7d:  Array<{ product_id: string; product_name: string; total_sold: number }>
  top_store_products_30d: Array<{ product_id: string; product_name: string; total_sold: number }>
  top_consumed_items_7d:  Array<{ item_id: string; item_name: string; unit: string; total_consumed: number }>
  top_consumed_items_30d: Array<{ item_id: string; item_name: string; unit: string; total_consumed: number }>
  predictions:            InventoryPrediction[]
  suggested_reorders:     Array<{
    item_id:           string
    item_name:         string
    unit:              string
    current_quantity:  number
    reorder_point:     number
    suggested_quantity: number
    reason:            string
  }>
  has_sufficient_data:    boolean
}

// ── Scanner ────────────────────────────────────────────────────────────────────

export interface ScanRequest {
  barcode:     string
  action:      ScanAction
  quantity?:   number
  itemId?:     string
  productId?:  string
  itemDraft?:  Partial<Omit<InventoryItem, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>>
}

export interface ScanResult {
  ok:            boolean
  action:        ScanAction
  barcode:       string
  item?:         InventoryItem | null
  movement?:     InventoryMovement | null
  scan_event_id: string
  message:       string
  error?:        string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export const ITEM_TYPE_LABELS: Record<InventoryItemType, string> = {
  supply:       'Supply',
  ingredient:   'Ingredient',
  material:     'Material',
  retail_stock: 'Retail Stock',
  tool:         'Tool',
  equipment:    'Equipment',
  packaging:    'Packaging',
  utensil:      'Utensil',
  cleaning:     'Cleaning',
  other:        'Other',
}

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  manual_adjustment: 'Manual Adjustment',
  sale:              'Sale',
  return:            'Return',
  restock:           'Restock',
  waste:             'Waste',
  damage:            'Damage',
  transfer:          'Transfer',
  count_correction:  'Count Correction',
  barcode_scan:      'Barcode Scan',
  system_prediction: 'System Prediction',
  other:             'Other',
}

export const ALERT_SEVERITY_COLORS: Record<AlertSeverity, string> = {
  low:      'text-blue-400 bg-blue-400/10',
  medium:   'text-yellow-400 bg-yellow-400/10',
  high:     'text-orange-400 bg-orange-400/10',
  critical: 'text-red-400 bg-red-400/10',
}

export const ALERT_STATUS_COLORS: Record<AlertStatus, string> = {
  open:         'text-red-400 bg-red-400/10',
  acknowledged: 'text-yellow-400 bg-yellow-400/10',
  resolved:     'text-green-400 bg-green-400/10',
  dismissed:    'text-zinc-400 bg-zinc-400/10',
}
