import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_TENANT_ACCENT, resolveSafeTenantAccent } from '@/lib/design-system/tenantAccent'

test('tenant accent resolver accepts a readable six-digit brand color', () => {
  assert.deepEqual(resolveSafeTenantAccent('#3b82f6'), {
    accent: '#3b82f6',
    accentRgb: '59 130 246',
    foreground: '#ffffff',
    wasAdjusted: false,
  })
})

test('tenant accent resolver rejects malformed, excessively dark, and excessively light colors', () => {
  for (const value of ['red', '#000000', '#ffffff', 'javascript:alert(1)', null]) {
    const result = resolveSafeTenantAccent(value)
    assert.equal(result.accent, DEFAULT_TENANT_ACCENT)
    assert.equal(result.wasAdjusted, true)
  }
})

test('tenant accent resolver selects a contrasting control foreground', () => {
  assert.equal(resolveSafeTenantAccent('#f59e0b').foreground, '#080b11')
  assert.equal(resolveSafeTenantAccent('#7c3aed').foreground, '#ffffff')
})
