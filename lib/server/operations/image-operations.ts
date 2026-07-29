import 'server-only'

import { getSupabaseServerClient } from '@/lib/supabase/server'

export type OwnerImageOperationsSummary = {
  generatedAt: string
  storage: {
    originalBytes: number
    derivativeBytes: number
    assetCount: number
    tenantCount: number
  }
  images: {
    imageCount: number
    imagesToday: number
    duplicates: number
    duplicateRate: number
  }
  ai: {
    tasksToday: number
    cacheHits: number
    cacheMisses: number
    cacheHitRate: number
    estimatedCost: number
    estimatedCostAvoided: number
  }
  queue: {
    activeJobs: number
    failedJobs: number
    oldestActiveJob: string | null
  }
  alerts: Array<{ tone: 'ok' | 'warn' | 'critical'; title: string; detail: string }>
}

type SummaryRpc = {
  generatedAt?: string
  storage?: {
    original_bytes?: number
    derivative_bytes?: number
    asset_count?: number
    tenant_count?: number
  }
  images?: {
    image_count?: number
    images_today?: number
    duplicates?: number
  }
  ai?: {
    tasks_today?: number
    cache_hits?: number
    cache_misses?: number
    estimated_cost?: number
    estimated_cost_avoided?: number
  }
  queue?: {
    active_jobs?: number
    failed_jobs?: number
    oldest_active_job?: string | null
  }
}

export async function loadOwnerImageOperationsSummary(): Promise<OwnerImageOperationsSummary> {
  const db = getSupabaseServerClient()
  const rpcDb = db as unknown as {
    rpc(name: 'get_owner_image_operations_summary'): Promise<{
      data: unknown
      error: { message: string } | null
    }>
  }
  const { data, error } = await rpcDb.rpc('get_owner_image_operations_summary')
  if (error) throw new Error(error.message)
  const raw = (data ?? {}) as SummaryRpc
  const imageCount = number(raw.images?.image_count)
  const duplicates = number(raw.images?.duplicates)
  const cacheHits = number(raw.ai?.cache_hits)
  const cacheMisses = number(raw.ai?.cache_misses)
  const summary: OwnerImageOperationsSummary = {
    generatedAt: raw.generatedAt ?? new Date().toISOString(),
    storage: {
      originalBytes: number(raw.storage?.original_bytes),
      derivativeBytes: number(raw.storage?.derivative_bytes),
      assetCount: number(raw.storage?.asset_count),
      tenantCount: number(raw.storage?.tenant_count),
    },
    images: {
      imageCount,
      imagesToday: number(raw.images?.images_today),
      duplicates,
      duplicateRate: imageCount > 0 ? Math.round((duplicates / imageCount) * 1000) / 10 : 0,
    },
    ai: {
      tasksToday: number(raw.ai?.tasks_today),
      cacheHits,
      cacheMisses,
      cacheHitRate:
        cacheHits + cacheMisses > 0
          ? Math.round((cacheHits / (cacheHits + cacheMisses)) * 1000) / 10
          : 0,
      estimatedCost: number(raw.ai?.estimated_cost),
      estimatedCostAvoided: number(raw.ai?.estimated_cost_avoided),
    },
    queue: {
      activeJobs: number(raw.queue?.active_jobs),
      failedJobs: number(raw.queue?.failed_jobs),
      oldestActiveJob: raw.queue?.oldest_active_job ?? null,
    },
    alerts: [],
  }
  summary.alerts = buildAlerts(summary)
  return summary
}

function buildAlerts(summary: OwnerImageOperationsSummary) {
  const alerts: OwnerImageOperationsSummary['alerts'] = []
  if (summary.queue.failedJobs > 0) {
    alerts.push({
      tone: 'critical',
      title: 'Failed image jobs',
      detail: `${summary.queue.failedJobs} queue jobs are marked failed.`,
    })
  }
  if (summary.queue.activeJobs > 100) {
    alerts.push({
      tone: 'warn',
      title: 'Queue backlog',
      detail: `${summary.queue.activeJobs} image jobs are still active.`,
    })
  }
  if (summary.ai.cacheHits + summary.ai.cacheMisses >= 20 && summary.ai.cacheHitRate < 10) {
    alerts.push({
      tone: 'warn',
      title: 'Low AI cache reuse',
      detail: `Cache hit rate is ${summary.ai.cacheHitRate}%.`,
    })
  }
  if (alerts.length === 0) {
    alerts.push({
      tone: 'ok',
      title: 'No urgent lifecycle alerts',
      detail: 'Storage, cache, and queue metrics have no critical platform alert.',
    })
  }
  return alerts
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
