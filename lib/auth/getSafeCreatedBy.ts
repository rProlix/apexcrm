// lib/auth/getSafeCreatedBy.ts
// Returns a safe created_by value for insert into website_image_plans /
// website_image_jobs (and any other table whose created_by FK references
// auth.users(id)).
//
// IMPORTANT:
//   Use ctx.auth_id, NOT ctx.id.
//   ctx.id  = public.users.id  (internal surrogate PK in the app's user table)
//   ctx.auth_id = auth.users.id (Supabase Auth UUID — what the FK references)
//
// Always pass ctx.auth_id here.  Passing ctx.id will cause:
//   "insert or update on table ... violates foreign key constraint
//    website_image_plans_created_by_fkey"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Returns a validated auth.users UUID to store as created_by,
 * or null if the input is absent / invalid.
 *
 * Pass `ctx.auth_id` (NOT `ctx.id`) from UserContext.
 */
export function getSafeCreatedBy(authUserId: string | null | undefined): string | null {
  if (!authUserId) return null
  if (!UUID_RE.test(authUserId)) return null
  return authUserId
}
