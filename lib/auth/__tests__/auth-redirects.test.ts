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
    `${redirectCall} must run after the Supabase try/catch so Next.js redirect signals are not swallowed.`,
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
