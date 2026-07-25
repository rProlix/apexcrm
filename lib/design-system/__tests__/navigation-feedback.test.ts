import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldTrackNavigationHref } from '@/lib/design-system/navigationFeedback'

const CURRENT_URL = 'https://app.example.com/dashboard?view=today'

test('navigation feedback tracks internal route and query changes', () => {
  assert.equal(shouldTrackNavigationHref('/vehicles', CURRENT_URL), true)
  assert.equal(shouldTrackNavigationHref('/dashboard?view=week', CURRENT_URL), true)
  assert.equal(shouldTrackNavigationHref('https://app.example.com/settings', CURRENT_URL), true)
})

test('navigation feedback ignores same-page and hash-only navigation', () => {
  assert.equal(shouldTrackNavigationHref(CURRENT_URL, CURRENT_URL), false)
  assert.equal(shouldTrackNavigationHref('#activity', CURRENT_URL), false)
  assert.equal(shouldTrackNavigationHref('/dashboard?view=today#activity', CURRENT_URL), false)
})

test('navigation feedback ignores external, unsupported, and malformed destinations', () => {
  assert.equal(shouldTrackNavigationHref('https://docs.example.com/help', CURRENT_URL), false)
  assert.equal(shouldTrackNavigationHref('mailto:help@example.com', CURRENT_URL), false)
  assert.equal(shouldTrackNavigationHref('http://[', CURRENT_URL), false)
})
