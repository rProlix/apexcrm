import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = (name: string) => readFileSync(path.join(root, name), 'utf8')

test('reward mutations require tenant predicates and stable idempotency', () => {
  const migration = source('supabase/migrations/20260904120000_rewards_loyalty_platform.sql')
  assert.match(migration, /Customer does not belong to tenant/)
  assert.match(migration, /rewards_transactions_idempotency_idx/)
  assert.match(migration, /reward_punch_events_idempotency_idx/)
  assert.match(migration, /prevent_reward_ledger_mutation/)
})
test('wallet credentials remain encrypted and server-only', () => {
  const migration = source('supabase/migrations/20260904120000_rewards_loyalty_platform.sql')
  const service = source('lib/rewards/wallet/service.ts')
  assert.match(migration, /authentication_token_hash/)
  assert.match(migration, /authentication_token_ciphertext/)
  assert.doesNotMatch(service, /NEXT_PUBLIC_APPLE/)
  assert.match(source('lib/rewards/security.ts'), /aes-256-gcm/)
})
test('wallet protocol uses canonical Apple paths and authorization scheme', () => {
  const register = source(
    'app/api/wallet/v1/devices/[deviceLibraryIdentifier]/registrations/[passTypeIdentifier]/[serialNumber]/route.ts'
  )
  const service = source('lib/rewards/wallet/service.ts')
  assert.match(register, /registerWalletDevice/)
  assert.match(service, /\^ApplePass/)
  assert.ok(source('app/api/wallet/v1/passes/[passTypeIdentifier]/[serialNumber]/route.ts'))
})
test('order and appointment rewards use completion transitions', () => {
  const orders = source('app/api/store/orders/[id]/route.ts')
  const create = source('app/api/store/orders/route.ts')
  const appointments = source('lib/appointments/updateAppointment.ts')
  assert.match(orders, /!COMPLETION_STATUSES\.has\(existing\.status\)/)
  assert.doesNotMatch(create, /applyOrderRewards/)
  assert.match(appointments, /current\.status !== 'completed'/)
})
