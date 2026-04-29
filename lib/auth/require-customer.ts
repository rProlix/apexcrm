// lib/auth/require-customer.ts
//
// Convenience re-exports for customer portal route protection.
//
// Usage in server components / route handlers:
//
//   import { requireCustomerAuth, getCustomerContext, customerScope } from '@/lib/auth/require-customer'
//
//   // Hard guard — redirects to /login if unauthenticated or no tenant account:
//   const ctx = await requireCustomerAuth(host)
//
//   // Soft guard — returns null instead of redirecting:
//   const ctx = await getCustomerContext(host)
//   if (!ctx) { ... }
//
//   // Scoped DB query filter:
//   const rows = await db.from('orders').select('*').match(customerScope(ctx))

export {
  requireCustomerAuth,
  getCustomerContext,
  customerScope,
  assertCustomerOwns,
} from '@/lib/auth/customerGuard'

export type { CustomerContext } from '@/lib/auth/types'
