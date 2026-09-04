import 'server-only'

import { connect } from 'node:http2'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { decryptRewardToken, encryptRewardToken, hashRewardToken } from '../security'
import { getAppleWalletSigningConfiguration } from './config'

export async function registerWalletDevice(input: {
  walletPassId: string
  deviceLibraryIdentifier: string
  pushToken: string
}): Promise<'created' | 'existing'> {
  const db = getSupabaseServerClient() as any
  const deviceHash = hashRewardToken(input.deviceLibraryIdentifier)
  const pushHash = hashRewardToken(input.pushToken)
  let { data: device } = await db
    .from('wallet_devices')
    .select('id')
    .eq('device_library_identifier_hash', deviceHash)
    .maybeSingle()
  if (!device) {
    const result = await db
      .from('wallet_devices')
      .insert({
        device_library_identifier_hash: deviceHash,
        push_token_hash: pushHash,
        push_token_ciphertext: encryptRewardToken(input.pushToken),
      })
      .select('id')
      .single()
    if (result.error || !result.data)
      throw new Error(`Unable to register Wallet device: ${result.error?.code ?? 'unknown'}`)
    device = result.data
  } else {
    await db
      .from('wallet_devices')
      .update({
        push_token_hash: pushHash,
        push_token_ciphertext: encryptRewardToken(input.pushToken),
        updated_at: new Date().toISOString(),
      })
      .eq('id', device.id)
  }
  const { data: existing } = await db
    .from('wallet_pass_registrations')
    .select('device_id')
    .eq('device_id', device.id)
    .eq('wallet_pass_id', input.walletPassId)
    .maybeSingle()
  if (existing) return 'existing'
  const { error } = await db
    .from('wallet_pass_registrations')
    .insert({ device_id: device.id, wallet_pass_id: input.walletPassId })
  if (error) throw new Error(`Unable to register Wallet pass: ${error.code}`)
  return 'created'
}

export async function unregisterWalletDevice(
  walletPassId: string,
  deviceLibraryIdentifier: string
): Promise<void> {
  const db = getSupabaseServerClient() as any
  const deviceHash = hashRewardToken(deviceLibraryIdentifier)
  const { data: device } = await db
    .from('wallet_devices')
    .select('id')
    .eq('device_library_identifier_hash', deviceHash)
    .maybeSingle()
  if (!device) return
  await db
    .from('wallet_pass_registrations')
    .delete()
    .eq('device_id', device.id)
    .eq('wallet_pass_id', walletPassId)
}

export async function getUpdatedSerialNumbers(input: {
  deviceLibraryIdentifier: string
  passTypeIdentifier: string
  updatedSince: number
}): Promise<{ serialNumbers: string[]; lastUpdated: string } | null> {
  const db = getSupabaseServerClient() as any
  const deviceHash = hashRewardToken(input.deviceLibraryIdentifier)
  const { data: device } = await db
    .from('wallet_devices')
    .select('id')
    .eq('device_library_identifier_hash', deviceHash)
    .maybeSingle()
  if (!device) return null
  const { data } = await db
    .from('wallet_pass_registrations')
    .select('wallet_passes!inner(serial_number,last_updated_tag,provider)')
    .eq('device_id', device.id)
  const passes = (data ?? [])
    .map((row: any) => row.wallet_passes)
    .filter(
      (pass: any) =>
        pass?.provider === 'apple' && Number(pass.last_updated_tag) > input.updatedSince
    )
  const latest = passes.reduce(
    (max: number, pass: any) => Math.max(max, Number(pass.last_updated_tag)),
    input.updatedSince
  )
  return {
    serialNumbers: passes.map((pass: any) => pass.serial_number),
    lastUpdated: String(latest),
  }
}

async function sendApplePush(
  pushToken: string
): Promise<{ ok: boolean; invalid: boolean; error?: string }> {
  const config = getAppleWalletSigningConfiguration()
  return new Promise((resolve) => {
    const client = connect('https://api.push.apple.com', {
      cert: config.certificates.signerCert,
      key: config.certificates.signerKey,
      passphrase: config.certificates.signerKeyPassphrase,
    })
    client.once('error', (error) => resolve({ ok: false, invalid: false, error: error.message }))
    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${encodeURIComponent(pushToken)}`,
      'apns-topic': config.passTypeIdentifier,
      'content-type': 'application/json',
    })
    let status = 0
    request.on('response', (headers) => {
      status = Number(headers[':status'] ?? 0)
    })
    request.on('data', () => undefined)
    request.once('error', (error) => {
      client.close()
      resolve({ ok: false, invalid: false, error: error.message })
    })
    request.once('end', () => {
      client.close()
      resolve({
        ok: status === 200,
        invalid: status === 410 || status === 400,
        error: status === 200 ? undefined : `APNs status ${status}`,
      })
    })
    request.end('{}')
  })
}

export async function processPendingWalletUpdates(limit = 50) {
  const db = getSupabaseServerClient() as any
  const { data: jobs } = await db
    .from('wallet_update_jobs')
    .select('id,tenant_id,wallet_pass_id,attempt_count')
    .eq('status', 'pending')
    .lte('available_at', new Date().toISOString())
    .order('available_at')
    .limit(limit)
  let completed = 0
  let failed = 0
  for (const job of jobs ?? []) {
    await db
      .from('wallet_update_jobs')
      .update({
        status: 'processing',
        attempt_count: job.attempt_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'pending')
    const { data: registrations } = await db
      .from('wallet_pass_registrations')
      .select('device_id,wallet_devices!inner(push_token_ciphertext)')
      .eq('wallet_pass_id', job.wallet_pass_id)
    let jobError: string | null = null
    for (const registration of registrations ?? []) {
      try {
        const token = decryptRewardToken(registration.wallet_devices.push_token_ciphertext)
        const result = await sendApplePush(token)
        if (result.invalid)
          await db
            .from('wallet_pass_registrations')
            .delete()
            .eq('wallet_pass_id', job.wallet_pass_id)
            .eq('device_id', registration.device_id)
        if (!result.ok && !result.invalid) jobError = result.error ?? 'APNs update failed'
      } catch (error) {
        jobError = error instanceof Error ? error.message : 'APNs update failed'
      }
    }
    if (jobError) {
      failed += 1
      await db
        .from('wallet_update_jobs')
        .update({
          status: job.attempt_count + 1 >= 5 ? 'failed' : 'pending',
          available_at: new Date(
            Date.now() + Math.min(300_000, 2 ** job.attempt_count * 10_000)
          ).toISOString(),
          last_error: jobError.slice(0, 300),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)
    } else {
      completed += 1
      await db
        .from('wallet_update_jobs')
        .update({ status: 'completed', last_error: null, updated_at: new Date().toISOString() })
        .eq('id', job.id)
    }
  }
  return { processed: (jobs ?? []).length, completed, failed }
}
