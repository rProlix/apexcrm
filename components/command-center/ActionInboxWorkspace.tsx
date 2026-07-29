'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, ArrowUpRight, Focus, List, ShieldCheck, X } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ActionItem, CommandActionStatus } from '@/lib/command-center/types'
import { MOTION_TRANSITION } from '@/lib/design-system/motion'
import { cn } from '@/lib/utils'
import { ActionStatusControls } from '@/components/command-center/ActionStatusControls'
import { QuickPeekTrigger } from '@/components/command-center/QuickPeek'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SignedDamageImage } from '@/components/van-damage/SignedDamageImage'

export function ActionInboxWorkspace({
  items,
  canDismiss,
  timeZone,
  initialFocusId,
}: {
  items: ActionItem[]
  canDismiss: boolean
  timeZone: string
  initialFocusId?: string
}) {
  const [focusMode, setFocusMode] = useState(Boolean(initialFocusId))
  const [currentId, setCurrentId] = useState(initialFocusId ?? items[0]?.id ?? '')
  const [removed, setRemoved] = useState<Set<string>>(() => new Set())
  const listScrollRef = useRef(0)
  const exitButtonRef = useRef<HTMLButtonElement>(null)
  const visibleItems = useMemo(
    () => items.filter((item) => !removed.has(item.id)),
    [items, removed]
  )
  const currentIndex = Math.max(
    0,
    visibleItems.findIndex((item) => item.id === currentId)
  )
  const current = visibleItems[currentIndex] ?? visibleItems[0]
  const next = visibleItems[currentIndex + 1] ?? null

  useEffect(() => {
    if (!visibleItems.length) {
      setFocusMode(false)
      return
    }
    if (!visibleItems.some((item) => item.id === currentId)) {
      setCurrentId(visibleItems[Math.min(currentIndex, visibleItems.length - 1)].id)
    }
  }, [currentId, currentIndex, visibleItems])

  const enterFocus = useCallback(
    (id?: string) => {
      listScrollRef.current = window.scrollY
      if (id) setCurrentId(id)
      else if (!currentId && visibleItems[0]) setCurrentId(visibleItems[0].id)
      setFocusMode(true)
      window.requestAnimationFrame(() => exitButtonRef.current?.focus())
    },
    [currentId, visibleItems]
  )

  const exitFocus = useCallback(() => {
    setFocusMode(false)
    window.requestAnimationFrame(() =>
      window.scrollTo({ top: listScrollRef.current, behavior: 'auto' })
    )
  }, [])

  useEffect(() => {
    if (!focusMode) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, button, a')) return
      if (event.key === 'Escape') {
        event.preventDefault()
        exitFocus()
      } else if (event.key === 'ArrowRight' && next) {
        event.preventDefault()
        setCurrentId(next.id)
      } else if (event.key === 'ArrowLeft' && currentIndex > 0) {
        event.preventDefault()
        setCurrentId(visibleItems[currentIndex - 1].id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [currentIndex, exitFocus, focusMode, next, visibleItems])

  const onConfirmed = useCallback(
    (id: string, status: CommandActionStatus) => {
      if (status !== 'resolved' && status !== 'dismissed') return
      const index = visibleItems.findIndex((item) => item.id === id)
      const candidate = visibleItems[index + 1] ?? visibleItems[index - 1]
      setRemoved((currentRemoved) => new Set(currentRemoved).add(id))
      if (candidate) setCurrentId(candidate.id)
    },
    [visibleItems]
  )

  if (!focusMode) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/45">Work the full list or switch to one-item review.</p>
          <button
            type="button"
            disabled={visibleItems.length === 0}
            onClick={() => enterFocus()}
            className="ui-button-primary"
          >
            <Focus className="h-4 w-4" />
            Focus mode
          </button>
        </div>
        <AnimatePresence initial={false}>
          {visibleItems.map((item) => (
            <motion.article
              layout
              key={item.id}
              initial={false}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={MOTION_TRANSITION.layout}
            >
              <ActionCard
                item={item}
                canDismiss={canDismiss}
                timeZone={timeZone}
                onFocus={() => enterFocus(item.id)}
                onConfirmed={(status) => onConfirmed(item.id, status)}
              />
            </motion.article>
          ))}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <section className="ui-surface overflow-hidden" aria-label="Action Required focus mode">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.075] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Focus className="h-4 w-4 text-brand" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-white">Focus mode</h2>
            <p className="text-xs text-white/35">
              {visibleItems.length
                ? `${currentIndex + 1} of ${visibleItems.length} in this filtered queue`
                : 'Queue complete'}
            </p>
          </div>
        </div>
        <button
          ref={exitButtonRef}
          type="button"
          onClick={exitFocus}
          className="ui-button-secondary"
        >
          <List className="h-4 w-4" />
          Return to inbox
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      {current ? (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.id}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={MOTION_TRANSITION.state}
            className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_18rem]"
          >
            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={current.priority} />
                <StatusBadge status={current.status} />
                <span className="rounded-lg border border-white/8 bg-white/[0.03] px-2 py-1 text-xs capitalize text-white/45">
                  {current.moduleKey.replaceAll('_', ' ')}
                </span>
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.02em] text-white">
                {current.title}
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/58">
                {current.description}
              </p>

              {current.evidenceImage && (
                <div className="mt-6 max-w-xl">
                  <ActionEvidencePreview
                    imageId={current.evidenceImage.imageId}
                    businessId={current.evidenceImage.businessId}
                    alt={current.evidenceImage.alt ?? `${current.title} evidence image`}
                    caption={current.evidenceImage.caption}
                    eager
                  />
                </div>
              )}

              <div className="mt-6 grid gap-4 border-y border-white/[0.075] py-5 sm:grid-cols-2">
                <FocusDetail
                  label="Why it needs action"
                  value={current.actionType.replaceAll('_', ' ')}
                />
                <FocusDetail
                  label="Source context"
                  value={current.sourceRecordLabel || current.sourceRecordType.replaceAll('_', ' ')}
                />
                <FocusDetail
                  label="Assignment"
                  value={
                    current.assignedUserId
                      ? 'Assigned to a staff member'
                      : current.assignedRole
                        ? `Assigned to ${current.assignedRole}`
                        : 'Unassigned'
                  }
                />
                <FocusDetail
                  label="Latest evidence"
                  value={formatDate(current.latestActivityAt, timeZone)}
                />
              </div>

              <div className="mt-6">
                <p className="mb-3 text-xs font-medium text-white/38">Safe next action</p>
                <ActionStatusControls
                  actionItemId={current.id}
                  canDismiss={canDismiss}
                  onConfirmed={(status) => onConfirmed(current.id, status)}
                />
              </div>
            </div>

            <aside className="border-t border-white/[0.075] bg-black/10 p-5 xl:border-l xl:border-t-0">
              <p className="text-xs font-medium text-white/38">Record context</p>
              <div className="mt-3 space-y-2">
                <QuickPeekTrigger type="action" id={current.id} className="w-full" />
                <Link href={current.href} className="ui-button-secondary w-full">
                  Open source record
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="mt-7 border-t border-white/[0.075] pt-5">
                <p className="text-xs font-medium text-white/38">Next in queue</p>
                {next ? (
                  <button
                    type="button"
                    onClick={() => setCurrentId(next.id)}
                    className="focus-ring mt-3 w-full rounded-xl border border-white/[0.075] p-3 text-left hover:bg-white/[0.035]"
                  >
                    <span className="block text-sm font-medium text-white/72">{next.title}</span>
                    <span className="mt-1 block text-xs capitalize text-white/35">
                      {next.priority} priority
                    </span>
                  </button>
                ) : (
                  <div className="mt-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-3">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                    <p className="mt-2 text-xs leading-5 text-emerald-100/65">
                      This is the last item in the filtered queue.
                    </p>
                  </div>
                )}
              </div>
              <div className="mt-5 flex items-center justify-between">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentId(visibleItems[currentIndex - 1].id)}
                  className="ui-button-ghost disabled:opacity-30"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!next}
                  onClick={() => next && setCurrentId(next.id)}
                  className="ui-button-ghost disabled:opacity-30"
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </aside>
          </motion.div>
        </AnimatePresence>
      ) : (
        <div className="px-5 py-14 text-center">
          <ShieldCheck className="mx-auto h-7 w-7 text-emerald-300" />
          <h3 className="mt-3 text-base font-semibold text-white">Filtered queue complete</h3>
          <p className="mt-1 text-sm text-white/45">No items remain in this review session.</p>
          <button type="button" onClick={exitFocus} className="ui-button-secondary mt-5">
            Return to inbox
          </button>
        </div>
      )}
    </section>
  )
}

function ActionCard({
  item,
  canDismiss,
  timeZone,
  onFocus,
  onConfirmed,
}: {
  item: ActionItem
  canDismiss: boolean
  timeZone: string
  onFocus: () => void
  onConfirmed: (status: CommandActionStatus) => void
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-graphite-900/65 p-5 shadow-panel',
        item.priority === 'urgent'
          ? 'border-red-400/20'
          : item.priority === 'high'
            ? 'border-orange-400/15'
            : 'border-white/[0.075]'
      )}
    >
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={item.priority} />
            <span className="rounded-lg border border-white/8 bg-white/[0.035] px-2 py-1 text-xs capitalize text-white/50">
              {item.moduleKey.replaceAll('_', ' ')}
            </span>
            <StatusBadge status={item.status} />
          </div>
          <h2 className="mt-3 text-base font-semibold text-white">{item.title}</h2>
          <p className="mt-1 text-sm leading-6 text-white/50">{item.description}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/30">
            {item.sourceRecordLabel && <span>{item.sourceRecordLabel}</span>}
            <span>Updated {formatDate(item.latestActivityAt, timeZone)}</span>
            {item.dueAt && <span>Due {formatDate(item.dueAt, timeZone)}</span>}
          </div>
        </div>
        {item.evidenceImage && (
          <div className="w-full shrink-0 lg:w-44">
            <ActionEvidencePreview
              imageId={item.evidenceImage.imageId}
              businessId={item.evidenceImage.businessId}
              alt={item.evidenceImage.alt ?? `${item.title} evidence image`}
              caption={item.evidenceImage.caption}
            />
          </div>
        )}
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={onFocus} className="ui-button-secondary text-xs">
            <Focus className="h-3.5 w-3.5" />
            Focus
          </button>
          <QuickPeekTrigger type="action" id={item.id} className="text-xs" />
          <Link href={item.href} className="ui-button-primary text-xs">
            Open record <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
      {['open', 'in_progress', 'snoozed'].includes(item.status) && (
        <div className="mt-4 border-t border-white/5 pt-4">
          <ActionStatusControls
            actionItemId={item.id}
            canDismiss={canDismiss}
            onConfirmed={onConfirmed}
          />
        </div>
      )}
    </div>
  )
}

function ActionEvidencePreview({
  imageId,
  businessId,
  alt,
  caption,
  eager = false,
}: {
  imageId: string
  businessId: string
  alt: string
  caption?: string
  eager?: boolean
}) {
  return (
    <figure className="overflow-hidden rounded-xl border border-white/[0.075] bg-white/[0.025]">
      <SignedDamageImage
        imageId={imageId}
        businessId={businessId}
        profile="thumbnail"
        alt={alt}
        sizes="(max-width: 1024px) 100vw, 18rem"
        eager={eager}
      />
      {caption && (
        <figcaption className="border-t border-white/[0.06] px-3 py-2 text-xs capitalize text-white/42">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}

function FocusDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-white/35">{label}</p>
      <p className="mt-1 text-sm capitalize text-white/72">{value}</p>
    </div>
  )
}

function formatDate(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value))
}
