/**
 * Validated Supabase public environment variables.
 *
 * Both vars must be NEXT_PUBLIC_ so they are available in the browser,
 * in server components, in middleware (Edge runtime), and in server actions.
 *
 * Call this helper instead of reading process.env directly — it throws a
 * clear error (not the cryptic "@supabase/ssr: Your project's URL and API
 * key are required" message) when the variables are absent so the developer
 * knows exactly what to add in Vercel → Settings → Environment Variables.
 *
 * NOTE: SUPABASE_SERVICE_ROLE_KEY is intentionally NOT here.
 * It is a server-side secret and lives only in lib/supabase/server.ts.
 * Keeping it out of this shared helper prevents it from accidentally
 * being bundled into client-side code.
 */
export function getSupabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      '[Supabase] Missing environment variables.\n' +
      'Add the following to your Vercel project (Settings → Environment Variables)\n' +
      'and to your local .env.local file:\n\n' +
      '  NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co\n' +
      '  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>\n'
    )
  }

  return { url, key }
}
