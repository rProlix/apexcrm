import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { collectScrollExperienceBindings, type ScrollPublishedBinding } from './bindings'

export async function validateScrollExperienceBindings(
  db: SupabaseClient,
  tenantId: string,
  snapshot: unknown
) {
  const bindings = collectScrollExperienceBindings(snapshot)
  if (bindings.length === 0) return { ok: true as const, bindings }
  const ids = [...new Set(bindings.map((item) => item.experienceVersionId))]
  const { data, error } = await db
    .from('website_scroll_experience_versions')
    .select('id,experience_id,status')
    .eq('tenant_id', tenantId)
    .in('id', ids)
  if (error) return { ok: false as const, error: 'Could not validate Scroll Experience media.' }
  const ready = new Map((data ?? []).map((row) => [String(row.id), row]))
  const invalid = bindings.find((binding) => {
    const version = ready.get(binding.experienceVersionId)
    return !version || version.status !== 'READY' || version.experience_id !== binding.experienceId
  })
  if (invalid)
    return {
      ok: false as const,
      error:
        'A Scroll Experience is still processing or failed. Remove it or wait until it is ready before publishing.',
    }
  return { ok: true as const, bindings }
}

export async function activateScrollExperienceBindings(
  db: SupabaseClient,
  tenantId: string,
  siteVersionId: string,
  bindings: ScrollPublishedBinding[]
) {
  if (bindings.length === 0) {
    const { error } = await db
      .from('website_scroll_published_bindings')
      .update({ active: false })
      .eq('tenant_id', tenantId)
      .eq('active', true)
    if (error) throw new Error('Could not deactivate Scroll Experience bindings.')
    return
  }

  // Make the new version addressable before retiring the previous binding so
  // a failed insert cannot break media for the currently published site.
  const { error } = await db.from('website_scroll_published_bindings').upsert(
    bindings.map((binding) => ({
      tenant_id: tenantId,
      site_version_id: siteVersionId,
      experience_id: binding.experienceId,
      experience_version_id: binding.experienceVersionId,
      component_instance_id: binding.componentInstanceId,
      active: true,
    })),
    { onConflict: 'site_version_id,component_instance_id' }
  )
  if (error) throw new Error('Could not publish Scroll Experience bindings.')
  const { error: deactivateError } = await db
    .from('website_scroll_published_bindings')
    .update({ active: false })
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .neq('site_version_id', siteVersionId)
  if (deactivateError) throw new Error('Could not retire the previous Scroll Experience binding.')
  await db.from('website_scroll_experience_audit').insert(
    bindings.map((binding) => ({
      tenant_id: tenantId,
      experience_id: binding.experienceId,
      event_name: 'SCROLL_EXPERIENCE_PUBLISHED',
      metadata: {
        site_version_id: siteVersionId,
        component_instance_id: binding.componentInstanceId,
      },
    }))
  )
}

export async function deactivateScrollExperienceBindings(db: SupabaseClient, tenantId: string) {
  await db
    .from('website_scroll_published_bindings')
    .update({ active: false })
    .eq('tenant_id', tenantId)
    .eq('active', true)
}
