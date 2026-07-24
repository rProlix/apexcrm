export const MODULE_ASSISTANT_QUESTIONS: Record<string, Record<string, string>> = {
  vehicles: {
    needs_attention: 'Which vans need attention?',
    changed_today: 'What changed in the fleet today?',
    dispatch_risk: 'Which vans may not be ready for dispatch?',
  },
  damage_ai: {
    inspection_summary: 'Summarize today’s inspections.',
    needs_attention: 'Which inspection findings need attention?',
    changed_today: 'What changed since the start of today?',
  },
  maintenance: {
    prioritize: 'Prioritize today’s maintenance.',
    quick_fixes: 'Which maintenance issues appear to be quick fixes?',
    overdue: 'What maintenance is overdue?',
  },
  store: {
    orders_today: 'What changed in orders today?',
    inventory: 'What inventory needs attention?',
    best_sellers: 'Which products appear to be selling best?',
  },
  appointments: {
    schedule_gaps: 'Where are the gaps in the schedule?',
    no_shows: 'Which no-shows need follow-up?',
    follow_up: 'What appointments need follow-up?',
  },
  payments: {
    failed: 'What payments failed?',
    attention: 'What payment issues need attention?',
  },
  customers: {
    follow_up: 'Which customers need follow-up?',
    new_leads: 'What new leads came in today?',
  },
  website: {
    setup: 'What website setup steps are incomplete?',
    leads: 'Which form submissions need follow-up?',
  },
}

export function getModuleAssistantQuestions(
  activeModuleKeys: Iterable<string>
): Array<{ moduleKey: string; questions: Array<{ key: string; label: string }> }> {
  const active = new Set(activeModuleKeys)
  return Object.entries(MODULE_ASSISTANT_QUESTIONS)
    .filter(([moduleKey]) => active.has(moduleKey))
    .map(([moduleKey, questions]) => ({
      moduleKey,
      questions: Object.entries(questions).map(([key, label]) => ({ key, label })),
    }))
}

export function getModuleAssistantQuestion(moduleKey: string, questionKey: string): string | null {
  return MODULE_ASSISTANT_QUESTIONS[moduleKey]?.[questionKey] ?? null
}
