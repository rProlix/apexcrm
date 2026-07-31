'use client'

import Link from 'next/link'
import { ArrowUpRight, CalendarClock, Eye, Loader2, PanelRightOpen, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type {
  CommandRecordType,
  QuickPeekField,
  QuickPeekMedia,
  QuickPeekPayload,
} from '@/lib/command-center/experience'
import { SignedDamageImage } from '@/components/van-damage/SignedDamageImage'
import { useBodyScrollLock } from '@/lib/design-system/body-scroll-lock'

interface QuickPeekRequest {
  type: CommandRecordType
  id: string
  previewMedia?: QuickPeekMedia[]
  origin?: HTMLElement | null
  originY?: number
  pushHistory?: boolean
}

interface QuickPeekContextValue {
  open: (request: QuickPeekRequest) => void
  close: () => void
}

const QuickPeekContext = createContext<QuickPeekContextValue | null>(null)
const QUICK_PEEK_EVENT = 'apex:quick-peek'

export function requestQuickPeek(request: QuickPeekRequest): void {
  window.dispatchEvent(new CustomEvent<QuickPeekRequest>(QUICK_PEEK_EVENT, { detail: request }))
}

export function QuickPeekProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<QuickPeekRequest | null>(null)
  const [record, setRecord] = useState<QuickPeekPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [originY, setOriginY] = useState('50%')
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const pushedHistoryRef = useRef(false)
  useBodyScrollLock(Boolean(request))

  const restoreFocus = useCallback((origin?: HTMLElement | null) => {
    window.requestAnimationFrame(() => {
      if (origin?.isConnected) origin.focus()
      else document.querySelector<HTMLElement>('[data-command-center-trigger]')?.focus()
    })
  }, [])

  const closeWithoutHistory = useCallback(() => {
    const origin = request?.origin
    setRequest(null)
    setRecord(null)
    setError(null)
    pushedHistoryRef.current = false
    restoreFocus(origin)
  }, [request?.origin, restoreFocus])

  const close = useCallback(() => {
    if (pushedHistoryRef.current && window.history.state?.apexQuickPeek) {
      window.history.back()
      return
    }
    closeWithoutHistory()
  }, [closeWithoutHistory])

  const open = useCallback((next: QuickPeekRequest) => {
    const pushHistory = next.pushHistory !== false
    setRequest({ ...next, pushHistory })
    setRecord(null)
    setError(null)
    if (next.originY != null) {
      setOriginY(`${Math.round(next.originY)}px`)
    } else if (next.origin) {
      const rect = next.origin.getBoundingClientRect()
      setOriginY(`${Math.round(rect.top + rect.height / 2)}px`)
    } else {
      setOriginY('50%')
    }
    if (pushHistory) {
      const url = new URL(window.location.href)
      url.searchParams.set('peek', `${next.type}:${next.id}`)
      window.history.pushState(
        { ...window.history.state, apexQuickPeek: true },
        '',
        `${url.pathname}${url.search}${url.hash}`
      )
      pushedHistoryRef.current = true
    }
  }, [])

  useEffect(() => {
    const onRequest = (event: Event) => {
      open((event as CustomEvent<QuickPeekRequest>).detail)
    }
    const onPopState = () => {
      if (!window.history.state?.apexQuickPeek) closeWithoutHistory()
    }
    window.addEventListener(QUICK_PEEK_EVENT, onRequest)
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener(QUICK_PEEK_EVENT, onRequest)
      window.removeEventListener('popstate', onPopState)
    }
  }, [closeWithoutHistory, open])

  useEffect(() => {
    if (!request) return
    const controller = new AbortController()
    setLoading(true)
    fetch(
      `/api/command-center/quick-peek?type=${encodeURIComponent(request.type)}&id=${encodeURIComponent(request.id)}`,
      { cache: 'no-store', signal: controller.signal }
    )
      .then(async (response) => {
        const body = (await response.json()) as { record?: QuickPeekPayload; error?: string }
        if (!response.ok || !body.record) {
          throw new Error(body.error ?? 'This record preview is unavailable.')
        }
        setRecord(body.record)
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(caught instanceof Error ? caught.message : 'This record preview is unavailable.')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [request])

  useEffect(() => {
    if (!request) return
    window.requestAnimationFrame(() => closeButtonRef.current?.focus())
  }, [request])

  useEffect(() => {
    if (!request) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = getFocusable(dialogRef.current)
      if (focusable.length === 0) return
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
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, request])

  const value = useMemo(() => ({ open, close }), [close, open])
  const visibleMedia = record?.media ?? request?.previewMedia

  return (
    <QuickPeekContext.Provider value={value}>
      {children}
      {request && (
        <div className="fixed inset-0 z-[60]" aria-live="off">
          <button
            type="button"
            aria-label="Close record preview"
            className="ui-overlay-backdrop absolute inset-0 h-full w-full cursor-default"
            onClick={close}
          />
          <aside
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-peek-title"
            className="ui-drawer-enter absolute inset-y-0 right-0 flex w-full flex-col border-l border-white/10 bg-graphite-900 shadow-panel-lg sm:max-w-md"
            style={{ '--quick-peek-origin-y': originY } as React.CSSProperties}
          >
            <header className="flex min-h-16 items-center justify-between border-b border-white/[0.075] px-4 sm:px-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <PanelRightOpen className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white/40">Quick Peek</p>
                  <p className="truncate text-sm font-semibold text-white/85">
                    {record?.title ?? 'Loading record'}
                  </p>
                </div>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={close}
                className="ui-button-ghost h-10 w-10 p-0"
                aria-label="Close Quick Peek"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
              {visibleMedia?.length ? (
                <div className="mb-6 space-y-2">
                  {visibleMedia.map((media) => (
                    <QuickPeekMediaPreview key={`${media.kind}:${media.imageId}`} media={media} />
                  ))}
                </div>
              ) : null}
              {loading && <QuickPeekSkeleton />}
              {error && !loading && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4"
                >
                  <p className="text-sm font-semibold text-red-100">Preview unavailable</p>
                  <p className="mt-1 text-sm leading-6 text-red-200/70">{error}</p>
                  <button type="button" onClick={close} className="ui-button-secondary mt-4">
                    Return to the list
                  </button>
                </div>
              )}
              {record && !loading && (
                <div className="space-y-6">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg border border-white/8 bg-white/[0.035] px-2 py-1 text-xs capitalize text-white/45">
                        {record.moduleKey.replaceAll('_', ' ')}
                      </span>
                      {record.status && (
                        <span className="rounded-lg border border-white/8 px-2 py-1 text-xs capitalize text-white/65">
                          {record.status.replaceAll('_', ' ')}
                        </span>
                      )}
                    </div>
                    <h2 id="quick-peek-title" className="mt-4 text-xl font-semibold text-white">
                      {record.title}
                    </h2>
                    <p className="mt-1 text-sm text-white/45">{record.subtitle}</p>
                    {record.summary && (
                      <p className="mt-4 text-sm leading-6 text-white/62">{record.summary}</p>
                    )}
                  </div>

                  <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-y border-white/[0.075] py-5">
                    {record.fields.map((item) => (
                      <div key={item.label} className="min-w-0">
                        <dt className="text-xs font-medium text-white/35">{item.label}</dt>
                        <dd className={cn('mt-1 break-words text-sm', fieldTone(item))}>
                          {item.value}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {record.updatedAt && (
                    <p className="flex items-center gap-2 text-xs text-white/35">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Preview loaded on demand. Source data remains authoritative.
                    </p>
                  )}
                </div>
              )}
            </div>

            {record && !loading && (
              <footer className="safe-area-bottom border-t border-white/[0.075] bg-graphite-900 p-4 sm:p-5">
                <div className="grid gap-2 sm:grid-cols-2">
                  {record.actions.map((action) => (
                    <Link
                      key={`${action.href}:${action.label}`}
                      href={action.href}
                      onClick={closeWithoutHistory}
                      className={cn(
                        action.primary ? 'ui-button-primary' : 'ui-button-secondary',
                        'w-full text-center'
                      )}
                    >
                      {action.label}
                      {action.primary && <ArrowUpRight className="h-4 w-4" />}
                    </Link>
                  ))}
                </div>
              </footer>
            )}
          </aside>
        </div>
      )}
    </QuickPeekContext.Provider>
  )
}

export function QuickPeekTrigger({
  type,
  id,
  label = 'Quick Peek',
  className,
  previewMedia,
  children,
}: {
  type: CommandRecordType
  id: string
  label?: string
  className?: string
  previewMedia?: QuickPeekMedia[]
  children?: React.ReactNode
}) {
  const context = useContext(QuickPeekContext)
  return (
    <button
      type="button"
      className={cn('ui-button-secondary', className)}
      onClick={(event) =>
        (context?.open ?? requestQuickPeek)({
          type,
          id,
          previewMedia,
          origin: event.currentTarget,
        })
      }
    >
      {children ?? (
        <>
          <Eye className="h-4 w-4" />
          {label}
        </>
      )}
    </button>
  )
}

function QuickPeekMediaPreview({ media }: { media: QuickPeekMedia }) {
  if (media.kind !== 'damage_image') return null
  return (
    <figure className="overflow-hidden rounded-xl border border-white/[0.075] bg-white/[0.025]">
      <SignedDamageImage
        imageId={media.imageId}
        businessId={media.businessId}
        profile="thumbnail"
        alt={media.alt}
        sizes="(max-width: 640px) 100vw, 28rem"
        eager
      />
      {media.caption && (
        <figcaption className="border-t border-white/[0.06] px-3 py-2 text-xs capitalize text-white/45">
          {media.caption}
        </figcaption>
      )}
    </figure>
  )
}

function QuickPeekSkeleton() {
  return (
    <div aria-label="Loading record preview" className="space-y-5">
      <div className="ui-skeleton h-5 w-24" />
      <div className="ui-skeleton h-8 w-3/4" />
      <div className="ui-skeleton h-4 w-2/5" />
      <div className="space-y-3 border-y border-white/[0.075] py-5">
        <div className="ui-skeleton h-12 w-full" />
        <div className="ui-skeleton h-12 w-full" />
        <div className="ui-skeleton h-12 w-4/5" />
      </div>
      <span className="sr-only">
        <Loader2 className="h-4 w-4" />
      </span>
    </div>
  )
}

function fieldTone(field: QuickPeekField): string {
  if (field.tone === 'strong') return 'font-semibold text-white'
  if (field.tone === 'danger') return 'font-medium text-red-200'
  if (field.tone === 'warning') return 'font-medium text-amber-200'
  if (field.tone === 'success') return 'font-medium text-emerald-200'
  return 'text-white/68'
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute('hidden'))
}
