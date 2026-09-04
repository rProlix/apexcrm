import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { findScrollExperienceBinding } from './bindings'

export type ResolvedPublicScrollBinding = {
  tenant_id: string
  experience_id: string
  component_instance_id: string
}

/**
 * Resolves an active media binding. The published snapshot fallback keeps media
 * available if an older, non-transactional publish switched the live snapshot
 * before its binding row was activated. It never authorizes draft-only media.
 */
export async function resolvePublicScrollExperienceBinding(
  db: SupabaseClient,
  experienceVersionId: string,
  componentInstanceId?: string
): Promise<ResolvedPublicScrollBinding | null> {
  let activeQuery = db
    .from('website_scroll_published_bindings')
    .select('tenant_id,experience_id,component_instance_id')
    .eq('experience_version_id', experienceVersionId)
    .eq('active', true)
  if (componentInstanceId)
    activeQuery = activeQuery.eq('component_instance_id', componentInstanceId)
  const { data: active } = await activeQuery.limit(1).maybeSingle()
  if (active) return active as ResolvedPublicScrollBinding

  const { data: version } = await db
    .from('website_scroll_experience_versions')
    .select('tenant_id,experience_id')
    .eq('id', experienceVersionId)
    .eq('status', 'READY')
    .maybeSingle()
  if (!version) return null

  const { data: settings } = await db
    .from('site_settings')
    .select('is_published,last_published_version_id')
    .eq('tenant_id', version.tenant_id)
    .eq('is_published', true)
    .maybeSingle()
  if (!settings?.last_published_version_id) return null

  const { data: siteVersion } = await db
    .from('site_versions')
    .select('snapshot')
    .eq('tenant_id', version.tenant_id)
    .eq('id', settings.last_published_version_id)
    .eq('status', 'published')
    .maybeSingle()
  const snapshotBinding = findScrollExperienceBinding(
    siteVersion?.snapshot,
    experienceVersionId,
    componentInstanceId
  )
  if (!snapshotBinding || snapshotBinding.experienceId !== version.experience_id) return null

  return {
    tenant_id: String(version.tenant_id),
    experience_id: String(version.experience_id),
    component_instance_id: snapshotBinding.componentInstanceId,
  }
}
