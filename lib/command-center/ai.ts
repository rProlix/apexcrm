import 'server-only'

import { callGeminiText } from '@/lib/ai/geminiRequest'
import { hasPermission } from '@/lib/auth/permissions'
import { recordCommandAudit } from './audit'
import { assertActiveModule, requireCommandCenterContext } from './context'
import { loadDailySummary } from './dailySummary'
import { getModuleAssistantQuestion } from './assistantPolicy'
export { getModuleAssistantQuestions } from './assistantPolicy'

const PUBLIC_FAILURE =
  'AI insights are temporarily unavailable. Your data is still saved and available for manual review.'

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
