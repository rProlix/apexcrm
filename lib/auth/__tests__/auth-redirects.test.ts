import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function readProjectFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function assertRedirectOutsideSupabaseCatch(source: string, redirectCall: string) {
  const catchIndex = source.indexOf('} catch')
  const redirectIndex = source.lastIndexOf(redirectCall)

  assert.notEqual(catchIndex, -1)
  assert.notEqual(redirectIndex, -1)
  assert.ok(
    redirectIndex > catchIndex,
    `${redirectCall} must run after the Supabase try/catch so Next.js redirect signals are not swallowed.`
  )
}

test('authenticated login page redirects are not swallowed by Supabase error handling', () => {
  const source = readProjectFile('lib/auth/redirectIfAuthed.ts')
  assertRedirectOutsideSupabaseCatch(source, 'redirect(destination)')
})

test('authenticated root page redirects are not swallowed by Supabase error handling', () => {
  const source = readProjectFile('app/page.tsx')
  assertRedirectOutsideSupabaseCatch(source, "redirect('/dashboard')")
})

test('dashboard auth guard preserves the protected destination through login', () => {
  const source = readProjectFile('middleware.ts')

  assert.match(source, /loginUrl\.pathname = '\/login'/)
  assert.match(
    source,
    /loginUrl\.searchParams\.set\('next', `\$\{pathname\}\$\{req\.nextUrl\.search\}`\)/
  )
})

test('CRM password login uses the same-origin server endpoint so session cookies are written by the app response', () => {
  const loginForm = readProjectFile('components/auth/LoginForm.tsx')
  const loginRoute = readProjectFile('app/api/auth/login/route.ts')

  assert.match(loginForm, /fetch\('\/api\/auth\/login'/)
  assert.match(loginForm, /credentials:\s*'same-origin'/)
  assert.doesNotMatch(loginForm, /signInWithPassword/)
  assert.match(loginRoute, /createSessionServerClient/)
  assert.match(loginRoute, /signInWithPassword/)
})

test('Supabase browser, server, and middleware clients share the cookie domain resolver', () => {
  assert.match(readProjectFile('lib/auth/cookieDomain.ts'), /'nexoranow\.com'/)
  assert.match(readProjectFile('lib/supabase/client.ts'), /getCookieDomain/)
  assert.match(readProjectFile('lib/supabase/server.ts'), /getCookieDomain/)
  assert.match(readProjectFile('lib/supabase/middleware.ts'), /getCookieDomain/)
})
