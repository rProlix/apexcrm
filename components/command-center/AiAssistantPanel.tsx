'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bot, Loader2, Sparkles } from 'lucide-react'

interface AssistantGroup {
  moduleKey: string
  questions: Array<{ key: string; label: string }>
}

export function AiAssistantPanel({ groups }: { groups: AssistantGroup[] }) {
  const [result, setResult] = useState<{
    moduleKey: string
    summary: string
    sourceLinks: Array<{ label: string; href: string }>
  } | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function ask(moduleKey: string, questionKey: string) {
    const requestKey = `${moduleKey}:${questionKey}`
    setLoading(requestKey)
    setError(null)
    try {
      const response = await fetch('/api/command-center/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleKey, questionKey }),
      })
      const payload = (await response.json()) as {
        summary?: string
        sourceLinks?: Array<{ label: string; href: string }>
        error?: string
      }
      if (!response.ok || !payload.summary) {
        throw new Error(
          payload.error ||
            'AI insights are temporarily unavailable. Your data is still saved and available for manual review.'
        )
      }
      setResult({
        moduleKey,
        summary: payload.summary,
        sourceLinks: payload.sourceLinks ?? [],
      })
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'AI insights are temporarily unavailable. Your data is still saved and available for manual review.'
      )
    } finally {
      setLoading(null)
    }
  }

  if (groups.length === 0) return null

  return (
    <section className="rounded-2xl border border-white/10 bg-graphite-900/60 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-violet-500/10 p-2 text-violet-300">
          <Bot className="h-4 w-4" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Module AI Assistants</h2>
          <p className="mt-1 text-xs text-white/40">
            Practical summaries use only active-module facts you can access. Suggestions still need
            human judgment.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {groups.map((group) => (
          <div
            key={group.moduleKey}
            className="rounded-xl border border-white/8 bg-white/[0.025] p-3"
          >
            <p className="mb-2 text-xs font-semibold capitalize text-white/65">
              {group.moduleKey.replace('_', ' ')} AI Assistant
            </p>
            <div className="flex flex-wrap gap-2">
              {group.questions.slice(0, 3).map((question) => {
                const requestKey = `${group.moduleKey}:${question.key}`
                return (
                  <button
                    key={question.key}
                    type="button"
                    disabled={loading !== null}
                    onClick={() => void ask(group.moduleKey, question.key)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-left text-xs text-white/50 hover:border-violet-400/30 hover:text-white disabled:opacity-40"
                  >
                    {loading === requestKey ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    {question.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200/80"
        >
          {error}
        </div>
      )}
      {result && (
        <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <p className="text-xs font-semibold capitalize text-violet-200">
            {result.moduleKey.replace('_', ' ')} AI Summary
          </p>
          <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/65">
            {result.summary}
          </div>
          {result.sourceLinks.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {result.sourceLinks.map((link) => (
                <Link
                  key={`${link.href}:${link.label}`}
                  href={link.href}
                  className="text-xs text-gold-400 hover:text-gold-300"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
