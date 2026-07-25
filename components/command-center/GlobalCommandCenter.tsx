'use client'

import { motion } from 'framer-motion'
import {
  ArrowRight,
  Clock3,
  Command,
  CornerDownLeft,
  FileSearch,
  Loader2,
  Search,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AnyRole } from '@/lib/auth/types'
import {
  filterCommandResults,
  getCommandNavigation,
  normalizeCommandQuery,
  type CommandResult,
} from '@/lib/command-center/experience'
import type { NavModule } from '@/modules/shared/moduleTypes'
import { MOTION_TRANSITION } from '@/lib/design-system/motion'
import { cn } from '@/lib/utils'
import { requestQuickPeek } from '@/components/command-center/QuickPeek'

interface GlobalCommandCenterProps {
  modules: NavModule[]
  role: AnyRole
  isPlatformAdmin: boolean
  commandCenter: {
    inbox: boolean
    activity: boolean
    reports: boolean
    setup: boolean
    notifications: boolean
  }
  openActionCount?: number
}

type OpenSource = 'keyboard' | 'pointer'
type InputMode = 'keyboard' | 'pointer'

export function GlobalCommandCenter(props: GlobalCommandCenterProps) {
  const router = useRouter()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [openSource, setOpenSource] = useState<OpenSource>('pointer')
  const [inputMode, setInputMode] = useState<InputMode>('keyboard')
  const [query, setQuery] = useState('')
  const [remoteResults, setRemoteResults] = useState<CommandResult[]>([])
  const [recent, setRecent] = useState<CommandResult[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const navigation = useMemo(() => getCommandNavigation(props), [props])
  const normalized = normalizeCommandQuery(query)
  const localResults = useMemo(
    () => filterCommandResults(navigation, normalized),
    [navigation, normalized]
  )
  const results = useMemo(() => {
    if (!normalized) {
      const recentIds = new Set(recent.map((item) => item.id))
      return [...recent, ...navigation.filter((item) => !recentIds.has(item.id))].slice(0, 14)
    }
    return [...localResults, ...remoteResults].slice(0, 36)
  }, [localResults, navigation, normalized, recent, remoteResults])

  const openDialog = useCallback((source: OpenSource) => {
    setOpenSource(source)
    setInputMode(source === 'keyboard' ? 'keyboard' : 'pointer')
    setOpen(true)
    setQuery('')
    setRemoteResults([])
    setError(null)
    setActiveIndex(0)
  }, [])

  const closeDialog = useCallback(() => {
    setOpen(false)
    setQuery('')
    setRemoteResults([])
    setError(null)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  useEffect(() => {
    const stored = window.sessionStorage.getItem('apex:recent-commands')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as CommandResult[]
      setRecent(parsed.filter(isSafeRecent).slice(0, 5))
    } catch {
      window.sessionStorage.removeItem('apex:recent-commands')
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        open ? closeDialog() : openDialog('keyboard')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeDialog, open, openDialog])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()
    const onDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDialog()
        return
      }
      if (event.key === 'Tab' && dialogRef.current) {
        trapFocus(event, dialogRef.current)
      }
    }
    window.addEventListener('keydown', onDialogKeyDown)
    return () => {
      window.removeEventListener('keydown', onDialogKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [closeDialog, open])

  useEffect(() => {
    if (!open || props.isPlatformAdmin || normalized.length < 2) {
      setRemoteResults([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      fetch(`/api/command-center/search?q=${encodeURIComponent(normalized)}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = (await response.json()) as { results?: CommandResult[]; error?: string }
          if (!response.ok) throw new Error(body.error ?? 'Search is temporarily unavailable.')
          setRemoteResults(body.results ?? [])
        })
        .catch((caught) => {
          if (caught instanceof DOMException && caught.name === 'AbortError') return
          setRemoteResults([])
          setError(caught instanceof Error ? caught.message : 'Search is temporarily unavailable.')
        })
        .finally(() => setLoading(false))
    }, 140)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [normalized, open, props.isPlatformAdmin])

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, results.length - 1)))
  }, [results.length])

  const remember = useCallback((result: CommandResult) => {
    setRecent((current) => {
      const next = [result, ...current.filter((item) => item.id !== result.id)].slice(0, 5)
      window.sessionStorage.setItem('apex:recent-commands', JSON.stringify(next))
      return next
    })
  }, [])

  const execute = useCallback(
    (result: CommandResult, interactionOrigin?: HTMLElement | null) => {
      remember(result)
      setOpen(false)
      if (result.recordType && result.recordId) {
        const selectedRect = interactionOrigin?.getBoundingClientRect()
        window.requestAnimationFrame(() =>
          requestQuickPeek({
            type: result.recordType!,
            id: result.recordId!,
            origin: triggerRef.current,
            originY: selectedRect ? selectedRect.top + selectedRect.height / 2 : undefined,
          })
        )
        return
      }
      router.push(result.href)
    },
    [remember, router]
  )

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    setInputMode('keyboard')
    if (event.key === 'Escape') {
      event.preventDefault()
      closeDialog()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (results.length ? (index + 1) % results.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) =>
        results.length ? (index - 1 + results.length) % results.length : 0
      )
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault()
      execute(results[activeIndex], document.getElementById(commandOptionId(results[activeIndex])))
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-command-center-trigger
        onClick={() => openDialog('pointer')}
        className="focus-ring hidden min-h-9 min-w-52 items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-3 text-left text-white/42 transition-colors hover:border-brand/25 hover:bg-white/[0.04] hover:text-white/70 lg:flex"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Search className="h-3.5 w-3.5" strokeWidth={2} />
        <span className="flex-1 text-xs">Search or run a command</span>
        {props.openActionCount ? (
          <span className="rounded-md bg-brand/[0.12] px-1.5 text-2xs font-semibold leading-5 text-brand">
            {props.openActionCount > 99 ? '99+' : props.openActionCount}
          </span>
        ) : null}
        <kbd className="rounded border border-white/10 bg-black/15 px-1.5 py-0.5 text-[10px] text-white/35">
          ⌘K
        </kbd>
      </button>
      <button
        type="button"
        data-command-center-trigger
        onClick={() => openDialog('pointer')}
        className="focus-ring flex h-10 w-10 items-center justify-center rounded-xl text-white/45 hover:bg-white/[0.05] hover:text-white lg:hidden"
        aria-label="Open command center"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Search className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[8dvh] sm:px-6 sm:pt-[12dvh]">
          <button
            type="button"
            className="ui-overlay-backdrop absolute inset-0 h-full w-full cursor-default"
            aria-label="Close command center"
            onClick={closeDialog}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-center-title"
            className="ui-overlay-enter relative flex max-h-[78dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-overlay)] border border-white/12 bg-graphite-900 shadow-panel-lg"
            data-input={openSource}
          >
            <div className="flex min-h-16 items-center border-b border-white/[0.075] px-4">
              <Command className="mr-3 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <label htmlFor="command-center-query" className="sr-only">
                Search records and commands
              </label>
              <input
                ref={inputRef}
                id="command-center-query"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActiveIndex(0)
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Search vans, inspections, maintenance, customers, and more"
                className="min-h-14 min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/28"
                role="combobox"
                aria-expanded="true"
                aria-controls="command-center-results"
                aria-activedescendant={
                  results[activeIndex] ? commandOptionId(results[activeIndex]) : undefined
                }
                autoComplete="off"
              />
              {loading && (
                <Loader2 className="h-4 w-4 animate-spin text-white/35" aria-label="Searching" />
              )}
              <button
                type="button"
                onClick={closeDialog}
                className="ui-button-ghost ml-2 h-9 w-9 p-0"
                aria-label="Close command center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              id="command-center-results"
              role="listbox"
              className="min-h-0 flex-1 overflow-y-auto p-2"
            >
              <div className="flex items-center justify-between px-2 pb-2 pt-1">
                <h2 id="command-center-title" className="text-xs font-medium text-white/38">
                  {normalized
                    ? 'Matching commands and records'
                    : recent.length
                      ? 'Recent and available'
                      : 'Available commands'}
                </h2>
                <span className="text-[11px] text-white/25">
                  {props.isPlatformAdmin
                    ? 'Owner commands'
                    : normalized.length >= 2
                      ? 'Tenant-scoped results'
                      : 'Type to search records'}
                </span>
              </div>
              {results.length > 0 ? (
                <div className="space-y-1">
                  {results.map((result, index) => {
                    const active = index === activeIndex
                    return (
                      <button
                        id={commandOptionId(result)}
                        key={result.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onMouseMove={() => {
                          setInputMode('pointer')
                          setActiveIndex(index)
                        }}
                        onClick={(event) => execute(result, event.currentTarget)}
                        className={cn(
                          'focus-ring relative flex min-h-14 w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-left',
                          active ? 'text-white' : 'text-white/62 hover:bg-white/[0.035]'
                        )}
                      >
                        {active &&
                          (inputMode === 'pointer' ? (
                            <motion.span
                              layoutId="command-active-result"
                              className="absolute inset-0 rounded-xl border border-brand/18 bg-brand/[0.075]"
                              transition={MOTION_TRANSITION.feedback}
                            />
                          ) : (
                            <span className="absolute inset-0 rounded-xl border border-brand/18 bg-brand/[0.075]" />
                          ))}
                        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.075] bg-white/[0.025]">
                          {result.kind === 'record' ? (
                            <FileSearch className="h-3.5 w-3.5" />
                          ) : result.kind === 'action' ? (
                            <CornerDownLeft className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowRight className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <span className="relative min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{result.label}</span>
                          <span className="mt-0.5 block truncate text-xs text-white/35">
                            {result.description}
                          </span>
                        </span>
                        <span className="relative hidden shrink-0 text-[11px] capitalize text-white/25 sm:block">
                          {result.moduleKey.replaceAll('_', ' ')}
                        </span>
                        {recent.some((item) => item.id === result.id) && !normalized && (
                          <Clock3 className="relative h-3.5 w-3.5 shrink-0 text-white/25" />
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : loading ? (
                <CommandSkeleton />
              ) : (
                <div className="px-4 py-12 text-center">
                  <FileSearch className="mx-auto h-6 w-6 text-white/20" />
                  <p className="mt-3 text-sm font-medium text-white/70">No authorized results</p>
                  <p className="mt-1 text-xs text-white/35">
                    Try a record name, van number, service, or action title.
                  </p>
                </div>
              )}
              {error && (
                <p
                  role="alert"
                  className="mx-2 mt-2 rounded-lg bg-red-400/[0.06] px-3 py-2 text-xs text-red-200"
                >
                  {error}
                </p>
              )}
            </div>

            <footer className="flex min-h-11 items-center gap-4 border-t border-white/[0.075] px-4 text-[11px] text-white/28">
              <span>↑↓ Navigate</span>
              <span>↵ Open</span>
              <span>Esc Close</span>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}

function CommandSkeleton() {
  return (
    <div className="space-y-2 p-2" aria-label="Searching authorized records">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="ui-skeleton h-8 w-8" />
          <div className="flex-1 space-y-2">
            <div className="ui-skeleton h-3 w-2/5" />
            <div className="ui-skeleton h-2.5 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

function commandOptionId(result: CommandResult): string {
  return `command-option-${result.id.replace(/[^a-z0-9_-]/gi, '-')}`
}

function isSafeRecent(value: CommandResult): boolean {
  return Boolean(
    value &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    typeof value.description === 'string' &&
    typeof value.href === 'string' &&
    value.href.startsWith('/')
  )
}

function trapFocus(event: KeyboardEvent, container: HTMLElement) {
  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )
  )
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
