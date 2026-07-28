import { createClient } from '@supabase/supabase-js'
import { config as loadEnvironment } from 'dotenv'
import { sendVanDamageJob } from '../lib/server/aws/sqs'
import { vanDamageJobSchema } from '../lib/van-damage/contracts'
import type { Database, Json } from '../lib/supabase/types'

loadEnvironment({ path: '.env.local' })

async function main() {
  const args = new Map(
    process.argv
      .slice(2)
      .map((value, index, all) =>
        value.startsWith('--')
          ? [value, all[index + 1]?.startsWith('--') ? 'true' : all[index + 1]]
          : null
      )
      .filter((entry): entry is [string, string] => Boolean(entry))
  )
  const tenantId = args.get('--tenant')
  const from = args.get('--from')
  const to = args.get('--to')
  const execute = args.has('--execute')
  if (!tenantId || !from || !to) {
    throw new Error(
      'Usage: tsx scripts/repair-multi-image-inspections.ts --tenant UUID --from ISO --to ISO [--execute]'
    )
  }
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service configuration is missing.')
  const db = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: inspections, error } = await db
    .from('van_damage_inspections')
    .select('id,tenant_id,business_id,created_at,ai_confidence,image_count')
    .eq('tenant_id', tenantId)
    .gte('created_at', from)
    .lte('created_at', to)
    .gt('image_count', 1)
    .order('created_at', { ascending: true })
  if (error) throw error

  let missingTotal = 0
  let queuedTotal = 0
  for (const inspection of inspections ?? []) {
    const [{ data: images }, { data: analyses }, { data: templateJobs }] = await Promise.all([
      db
        .from('van_damage_images')
        .select('id,slack_file_id')
        .eq('tenant_id', tenantId)
        .eq('inspection_id', inspection.id),
      db
        .from('van_damage_image_analyses')
        .select('image_id,status')
        .eq('tenant_id', tenantId)
        .eq('inspection_id', inspection.id),
      db
        .from('van_damage_jobs')
        .select('payload')
        .eq('tenant_id', tenantId)
        .eq('inspection_id', inspection.id)
        .order('created_at', { ascending: false })
        .limit(1),
    ])
    const valid = new Set(
      (analyses ?? [])
        .filter((analysis) => ['completed', 'needs_review'].includes(analysis.status))
        .map((analysis) => analysis.image_id)
    )
    const missing = (images ?? []).filter((image) => image.slack_file_id && !valid.has(image.id))
    if (!missing.length) {
      if (execute)
        await db.rpc('recalculate_van_damage_inspection_analysis', {
          p_tenant_id: tenantId,
          p_inspection_id: inspection.id,
        })
      continue
    }
    missingTotal += missing.length
    console.info(
      JSON.stringify({
        mode: execute ? 'execute' : 'dry-run',
        inspectionId: inspection.id,
        imageCount: inspection.image_count,
        missingImageCount: missing.length,
      })
    )
    if (!execute) continue
    const template = templateJobs?.[0]?.payload
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
      console.warn(JSON.stringify({ inspectionId: inspection.id, skipped: 'missing_job_template' }))
      continue
    }
    for (const image of missing) {
      const jobId = crypto.randomUUID()
      const payload = vanDamageJobSchema.parse({
        ...template,
        version: 'v1',
        jobType: 'van_damage_slack_inspection',
        jobId,
        tenantId,
        businessId: inspection.business_id,
        inspectionId: inspection.id,
        imageId: image.id,
        slackFileId: image.slack_file_id,
        slackFileIds: [image.slack_file_id],
        analysisVersion: 'van-damage-v2',
        createdAt: new Date().toISOString(),
      })
      const { error: insertError } = await db.from('van_damage_jobs').insert({
        id: jobId,
        tenant_id: tenantId,
        business_id: inspection.business_id,
        inspection_id: inspection.id,
        image_id: image.id,
        slack_event_id: payload.slackEventId,
        job_type: 'image_analysis',
        status: 'queued',
        analysis_version: payload.analysisVersion,
        idempotency_key: `${tenantId}:${image.id}:${payload.analysisVersion}`,
        payload: payload as unknown as Json,
      })
      if (insertError && insertError.code !== '23505') throw insertError
      const messageId = await sendVanDamageJob(payload)
      await db
        .from('van_damage_jobs')
        .update({ sqs_message_id: messageId, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('idempotency_key', `${tenantId}:${image.id}:${payload.analysisVersion}`)
      queuedTotal += 1
    }
    await db.from('activity_logs').insert({
      tenant_id: tenantId,
      actor_type: 'system',
      action: 'van_damage.multi_image_recovery_queued',
      entity_type: 'van_damage_inspection',
      entity_id: inspection.id,
      metadata: { queued_image_count: missing.length, from, to },
    })
    await db.rpc('recalculate_van_damage_inspection_analysis', {
      p_tenant_id: tenantId,
      p_inspection_id: inspection.id,
    })
  }
  console.info(
    JSON.stringify({
      mode: execute ? 'execute' : 'dry-run',
      inspectionsScanned: inspections?.length ?? 0,
      missingImages: missingTotal,
      queuedImages: queuedTotal,
    })
  )
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Recovery failed.')
  process.exitCode = 1
})
