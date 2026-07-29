import 'server-only'

import { callGeminiText } from '@/lib/ai/geminiRequest'
import { hasPermission } from '@/lib/auth/permissions'
import { loadInspectionCompliance } from '@/lib/server/van-damage/compliance'
import { recordCommandAudit } from './audit'
import { assertActiveModule, requireCommandCenterContext } from './context'
import { loadDailySummary } from './dailySummary'
import { getModuleAssistantQuestion } from './assistantPolicy'
import { normalizeAssistantQuestion, resolveCommandAssistantIntent } from './assistantIntent'
import type { CommandAssistantResponse, CommandResult } from './experience'
export { getModuleAssistantQuestions } from './assistantPolicy'

const PUBLIC_FAILURE =
  'AI insights are temporarily unavailable. Your data is still saved and available for manual review.'

export async function requestCommandAssistant(input: {
  query: string
  now?: Date
}): Promise<CommandAssistantResponse> {
  const question = normalizeAssistantQuestion(input.query)
  if (question.length < 3) throw new Error('Ask a complete operational question.')

  const context = await requireCommandCenterContext('use_modules')
  const intent = resolveCommandAssistantIntent(question, {
    now: input.now,
    timeZone: context.timeZone,
  })
  await recordCommandAudit({
    tenantId: context.tenantId,
    actorUserId: context.user.id,
    action: 'command_center.companion.requested',
    metadata: {
      intent: intent.type,
      query_length: question.length,
    },
  })

  let response: Omit<CommandAssistantResponse, 'generatedAt'>
  if (intent.type === 'unreviewed_vans') {
    assertActiveModule(context, 'damage_ai')
    response = await answerUnreviewedVans(context)
  } else if (intent.type === 'missing_inspections') {
    assertActiveModule(context, 'damage_ai')
    response = await answerMissingInspections(context, intent.date, intent.dateLabel, input.now)
  } else {
    response = await answerGroundedQuestion(context, question)
  }

  await recordCommandAudit({
    tenantId: context.tenantId,
    actorUserId: context.user.id,
    action: 'command_center.companion.generated',
    metadata: {
      intent: response.intent,
      result_count: response.results.length,
      source_count: response.sourceLinks.length,
    },
  })
  return { ...response, generatedAt: new Date().toISOString() }
}

export async function requestModuleAiAssistant(input: {
  moduleKey: string
  questionKey: string
}): Promise<{
  summary: string
  sourceLinks: Array<{ label: string; href: string }>
  generatedAt: string
}> {
  const context = await requireCommandCenterContext('use_modules')
  assertActiveModule(context, input.moduleKey)
  if (!hasPermission(context.role, 'view_dashboard')) {
    throw new Error('You do not have access to AI insights.')
  }
  const question = getModuleAssistantQuestion(input.moduleKey, input.questionKey)
  if (!question) throw new Error('Choose a supported module question.')

  const daily = await loadDailySummary(context)
  if (daily.state === 'error') throw new Error(PUBLIC_FAILURE)
  const moduleSection = daily.sections.find((section) => section.moduleKey === input.moduleKey)
  const relevantAlerts = daily.criticalAlerts.filter((alert) => alert.moduleKey === input.moduleKey)
  const sourceLinks = uniqueLinks([
    ...(moduleSection?.bullets.map((bullet) => ({
      label: bullet.text,
      href: bullet.href,
    })) ?? []),
    ...relevantAlerts.map((alert) => ({ label: alert.text, href: alert.href })),
  ]).slice(0, 8)

  const contextPayload = {
    date: daily.dateLabel,
    timeZone: daily.timeZone,
    facts:
      moduleSection?.bullets.map((bullet) => ({
        statement: bullet.text,
        value: bullet.value,
      })) ?? [],
    openRisks: relevantAlerts.map((alert) => alert.text),
  }
  const prompt = [
    'You are a business operations assistant.',
    `Answer this module-specific question: ${question}`,
    'Use only the supplied facts. Do not infer fault or responsibility.',
    'Clearly distinguish facts from suggestions. Never claim certainty.',
    'Return a concise summary followed by Key risks and Suggested next steps.',
    `Facts: ${JSON.stringify(contextPayload)}`,
  ].join('\n')

  await recordCommandAudit({
    tenantId: context.tenantId,
    actorUserId: context.user.id,
    action: 'command_center.ai.requested',
    metadata: {
      module_key: input.moduleKey,
      question_key: input.questionKey,
    },
  })

  let result: Awaited<ReturnType<typeof callGeminiText>>
  try {
    result = await callGeminiText({
      model:
        process.env.COMMAND_CENTER_AI_MODEL?.trim() ||
        process.env.GEMINI_360_PLANNER_MODEL?.trim() ||
        'gemini-2.5-flash-lite',
      prompt,
      feature: 'command-center-module-assistant',
      temperature: 0.2,
      maxOutputTokens: 900,
      timeoutMs: 30_000,
    })
  } catch {
    result = {
      text: '',
      data: null,
      tokenUsage: {},
      error: 'provider_unavailable',
    }
  }
  if (result.error || !result.text.trim()) {
    await recordCommandAudit({
      tenantId: context.tenantId,
      actorUserId: context.user.id,
      action: 'command_center.ai.failed',
      metadata: {
        module_key: input.moduleKey,
        question_key: input.questionKey,
        error_code: 'provider_unavailable',
      },
    })
    throw new Error(PUBLIC_FAILURE)
  }

  await recordCommandAudit({
    tenantId: context.tenantId,
    actorUserId: context.user.id,
    action: 'command_center.ai.generated',
    metadata: {
      module_key: input.moduleKey,
      question_key: input.questionKey,
      source_count: sourceLinks.length,
    },
  })
  return {
    summary: result.text.trim().slice(0, 12_000),
    sourceLinks,
    generatedAt: new Date().toISOString(),
  }
}

function uniqueLinks(
  links: Array<{ label: string; href: string }>
): Array<{ label: string; href: string }> {
  const seen = new Set<string>()
  return links.filter((link) => {
    if (!link.href.startsWith('/') || seen.has(link.href)) return false
    seen.add(link.href)
    return true
  })
}

async function answerUnreviewedVans(
  context: Awaited<ReturnType<typeof requireCommandCenterContext>>
): Promise<Omit<CommandAssistantResponse, 'generatedAt'>> {
  const { data, error } = await context.db
    .from('van_damage_inspections')
    .select('id,van_id,title,status,review_status,created_at')
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw new Error('Inspection review status could not be loaded.')

  const pending = (data ?? []).filter(
    (inspection) =>
      inspection.status === 'needs_review' ||
      (inspection.status === 'completed' && inspection.review_status !== 'reviewed')
  )
  const vanIds = [
    ...new Set(
      pending
        .map((inspection) => inspection.van_id)
        .filter((vanId): vanId is string => typeof vanId === 'string' && vanId.length > 0)
    ),
  ]
  const vehicleResult = vanIds.length
    ? await context.db
        .from('vehicles')
        .select('id,name,van_number,status')
        .eq('tenant_id', context.tenantId)
        .in('id', vanIds)
    : { data: [], error: null }
  if (vehicleResult.error) throw new Error('Vehicle review status could not be loaded.')

  const pendingByVan = new Map<string, typeof pending>()
  for (const inspection of pending) {
    if (!inspection.van_id) continue
    pendingByVan.set(inspection.van_id, [
      ...(pendingByVan.get(inspection.van_id) ?? []),
      inspection,
    ])
  }
  const results: CommandResult[] = (vehicleResult.data ?? [])
    .map((vehicle) => {
      const inspections = pendingByVan.get(vehicle.id) ?? []
      return {
        id: `assistant:unreviewed:${vehicle.id}`,
        kind: 'record' as const,
        label: vehicle.van_number ? `Van ${vehicle.van_number}` : vehicle.name || 'Unnamed van',
        description: `${inspections.length} ${pluralize(inspections.length, 'inspection')} awaiting review`,
        moduleKey: 'damage_ai',
        href: `/dashboard/damage-ai/inspections/${inspections[0].id}`,
        recordType: 'inspection' as const,
        recordId: inspections[0].id,
      }
    })
    .sort((first, second) => first.label.localeCompare(second.label, undefined, { numeric: true }))
    .slice(0, 36)

  return {
    answer:
      results.length === 0
        ? 'I found no vans with completed inspections awaiting human review.'
        : `I found ${results.length} ${pluralize(results.length, 'van')} with completed inspections that still need human review.`,
    intent: 'unreviewed_vans',
    results,
    sourceLinks: [
      {
        label: 'Open inspections needing review',
        href: '/dashboard/damage-ai?review=needs_review',
      },
    ],
  }
}

async function answerMissingInspections(
  context: Awaited<ReturnType<typeof requireCommandCenterContext>>,
  date: string,
  dateLabel: string,
  now = new Date()
): Promise<Omit<CommandAssistantResponse, 'generatedAt'>> {
  const compliance = await loadInspectionCompliance(context, {
    from: date,
    to: date,
    now,
  })
  const missing = compliance.slots.filter((slot) => slot.status === 'missing')
  const slotsByVan = new Map<string, typeof missing>()
  for (const slot of missing) {
    slotsByVan.set(slot.vanId, [...(slotsByVan.get(slot.vanId) ?? []), slot])
  }
  const results: CommandResult[] = [...slotsByVan.entries()]
    .map(([vanId, slots]) => ({
      id: `assistant:missing:${date}:${vanId}`,
      kind: 'record' as const,
      label: slots[0]?.vanLabel ?? 'Unidentified van',
      description: `Missing ${slots.map((slot) => slot.slotType).join(' and ')} inspection for ${date}`,
      moduleKey: 'damage_ai',
      href: `/dashboard/damage-ai/compliance?date=${date}&status=missing`,
    }))
    .sort((first, second) => first.label.localeCompare(second.label, undefined, { numeric: true }))
    .slice(0, 36)

  return {
    answer:
      results.length === 0
        ? `I found no vans with a missing required inspection for ${dateLabel}.`
        : `I found ${results.length} ${pluralize(results.length, 'van')} missing at least one required inspection for ${dateLabel}.`,
    intent: 'missing_inspections',
    results,
    sourceLinks: [
      {
        label: `Open inspection compliance for ${date}`,
        href: `/dashboard/damage-ai/compliance?date=${date}&status=missing`,
      },
    ],
  }
}

async function answerGroundedQuestion(
  context: Awaited<ReturnType<typeof requireCommandCenterContext>>,
  question: string
): Promise<Omit<CommandAssistantResponse, 'generatedAt'>> {
  const daily = await loadDailySummary(context)
  if (daily.state === 'error') throw new Error(PUBLIC_FAILURE)
  const sourceLinks = uniqueLinks([
    ...daily.sections.flatMap((section) =>
      section.bullets.map((bullet) => ({ label: bullet.text, href: bullet.href }))
    ),
    ...daily.criticalAlerts.map((alert) => ({ label: alert.text, href: alert.href })),
  ]).slice(0, 10)
  const facts = {
    date: daily.dateLabel,
    timeZone: daily.timeZone,
    activeModules: context.activeModuleKeys,
    sections: daily.sections.map((section) => ({
      module: section.moduleKey,
      facts: section.bullets.map((bullet) => bullet.text),
    })),
    criticalAlerts: daily.criticalAlerts.map((alert) => alert.text),
  }
  const result = await callGeminiText({
    model:
      process.env.COMMAND_CENTER_AI_MODEL?.trim() ||
      process.env.GEMINI_360_PLANNER_MODEL?.trim() ||
      'gemini-2.5-flash-lite',
    prompt: [
      'You are Nexora, an operations companion inside a multi-tenant business CRM.',
      `User request: ${question}`,
      'Answer only from the supplied authorized facts.',
      'Never invent records, counts, people, causes, fault, or completed actions.',
      'If the facts cannot answer the request, say what you can see and suggest a specific search or page.',
      'Be concise, practical, and distinguish facts from suggestions.',
      `Authorized facts: ${JSON.stringify(facts)}`,
    ].join('\n'),
    feature: 'command-center-companion',
    temperature: 0.15,
    maxOutputTokens: 900,
    timeoutMs: 30_000,
  })
  if (result.error || !result.text.trim()) throw new Error(PUBLIC_FAILURE)
  return {
    answer: result.text.trim().slice(0, 12_000),
    intent: 'general',
    results: [],
    sourceLinks,
  }
}

function pluralize(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`
}
