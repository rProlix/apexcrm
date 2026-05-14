// lib/inventory/supabaseInventory.ts
// Typed wrapper for inventory tables that aren't yet in the generated Supabase types.
// Once `supabase gen types` is run after the migration is applied,
// this file can be removed and imports replaced with the standard client.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import type {
  InventoryItem,
  InventoryMovement,
  InventoryAlert,
  InventoryScanEvent,
  InventorySettings,
  ProductInventoryLink,
} from './types'

type SupabaseClient = ReturnType<typeof getSupabaseServerClient>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

/**
 * Returns the supabase client cast to `any` for use with inventory tables
 * not yet in the generated types.
 */
export function getInventoryClient(): AnyClient {
  return getSupabaseServerClient() as AnyClient
}

export type {
  InventoryItem,
  InventoryMovement,
  InventoryAlert,
  InventoryScanEvent,
  InventorySettings,
  ProductInventoryLink,
  SupabaseClient,
}
