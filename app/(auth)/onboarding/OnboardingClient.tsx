'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const STEPS = [
  { label: 'Creating your workspace',   duration: 800  },
  { label: 'Enabling core modules',     duration: 900  },
  { label: 'Populating demo data',      duration: 1000 },
  { label: 'Configuring your store',    duration: 800  },
  { label: 'Building your dashboard',   duration: 700  },
  { label: 'Everything is ready!',      duration: 600  },
]

export function OnboardingClient() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const slug         = searchParams.get('slug') ?? ''
  const name         = searchParams.get('name') ?? 'Your Business'

  const [stepIndex,  setStepIndex]  = useState(0)
  const [progress,   setProgress]   = useState(0)
  const [done,       setDone]       = useState(false)

  useEffect(() => {
    let totalElapsed   = 0
    const totalDuration = STEPS.reduce((s, st) => s + st.duration, 0)
    let cancelled = false

    async function advance(i: number) {
      if (cancelled || i >= STEPS.length) {
        if (!cancelled) {
          setDone(true)
          setProgress(100)
          // Small pause so user can read "Everything is ready!" then forward
          await sleep(700)
          if (!cancelled) {
            router.replace('/dashboard')
          }
        }
        return
      }

      setStepIndex(i)
      const step = STEPS[i]

      // Animate progress bar within this step
      const fps        = 30
      const interval   = 1000 / fps
      const ticks      = Math.round(step.duration / interval)
      const startPct   = (totalElapsed / totalDuration) * 100
      const endPct     = ((totalElapsed + step.duration) / totalDuration) * 100

      await new Promise<void>((resolve) => {
        let tick = 0
        const id = setInterval(() => {
          if (cancelled) { clearInterval(id); resolve(); return }
          tick++
          const pct = startPct + ((endPct - startPct) * tick) / ticks
          setProgress(Math.min(pct, 100))
          if (tick >= ticks) { clearInterval(id); resolve() }
        }, interval)
      })

      totalElapsed += step.duration
      await advance(i + 1)
    }

    advance(0)
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN

  return (
    <div className="min-h-dvh bg-graphite-950 flex items-center justify-center px-6">
      <div className="text-center max-w-sm w-full space-y-8">

        {/* Animated logo */}
        <div className="flex flex-col items-center gap-5">
          <div
            className="h-16 w-16 rounded-2xl bg-gold-gradient flex items-center justify-center shadow-glow-gold"
            style={{ animation: done ? 'none' : 'pulse-gold 2s ease-in-out infinite' }}
          >
            <span className="text-graphite-900 font-bold text-2xl">A</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white mb-1">
              {done ? 'You\'re all set!' : 'Setting up your business'}
            </h1>
            <p className="text-sm text-white/40">
              {done
                ? `Welcome to ApexCRM, ${name}`
                : 'This only takes a few seconds…'
              }
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="h-2 w-full bg-graphite-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gold-gradient rounded-full transition-all duration-200 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-white/30 font-medium tabular-nums">
            {Math.round(progress)}%
          </p>
        </div>

        {/* Step list */}
        <ul className="space-y-2 text-left">
          {STEPS.map((step, i) => {
            const isCompleted = i < stepIndex || done
            const isCurrent   = i === stepIndex && !done

            return (
              <li
                key={step.label}
                className="flex items-center gap-3 text-sm transition-all duration-300"
              >
                <span className="shrink-0 h-5 w-5 flex items-center justify-center">
                  {isCompleted ? (
                    <svg className="h-4 w-4 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isCurrent ? (
                    <span className="h-2 w-2 rounded-full bg-gold-400 animate-pulse" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-white/10" />
                  )}
                </span>
                <span
                  className={
                    isCompleted ? 'text-white/60 line-through decoration-white/20' :
                    isCurrent   ? 'text-white font-medium' :
                                  'text-white/20'
                  }
                >
                  {step.label}
                </span>
              </li>
            )
          })}
        </ul>

        {/* Workspace URL preview */}
        {slug && rootDomain && (
          <div className="rounded-xl border border-surface-border bg-graphite-900/50 px-4 py-3">
            <p className="text-2xs text-white/25 uppercase tracking-wider mb-1">Your workspace URL</p>
            <p className="text-sm font-mono text-gold-400/80">
              {slug}.{rootDomain}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
