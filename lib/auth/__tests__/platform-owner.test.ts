import test from 'node:test'
import assert from 'node:assert/strict'
import { isPlatformOwner } from '../platform-owner'

test('only the platform owner role passes infrastructure authorization', () => {
  assert.equal(isPlatformOwner({ role: 'owner' }), true)
  assert.equal(isPlatformOwner({ role: 'admin' }), false)
  assert.equal(isPlatformOwner({ role: 'staff' }), false)
  assert.equal(isPlatformOwner({ role: 'customer' }), false)
  assert.equal(isPlatformOwner(null), false)
})
