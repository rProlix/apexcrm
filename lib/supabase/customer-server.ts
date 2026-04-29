// lib/supabase/customer-server.ts
//
// Server-side Supabase helpers for the customer portal.
// These are thin aliases of the core server helpers with names that clearly
// communicate their intent to developers working on customer-facing features.
//
// NEVER use these clients to perform operations that require admin/staff
// privileges — use getSupabaseServerClient() (service role) directly.

export {
  createSessionServerClient as createCustomerSessionClient,
  getSupabaseServerClient   as getCustomerServiceClient,
} from '@/lib/supabase/server'
