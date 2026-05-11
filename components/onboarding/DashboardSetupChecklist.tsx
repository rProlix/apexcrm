'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface ChecklistItem {
  id:       string
  label:    string
  href:     string
  done?:    boolean
}

interface ChecklistGroup {
  module:  string
  icon:    string
  title:   string
  items:   ChecklistItem[]
}

interface DashboardSetupChecklistProps {
  /** Module keys that are enabled for this tenant */
  enabledModules: string[]
  /** Tenancy identifier (for marking items complete in future) */
  tenantId?:      string
}

/** Dynamic setup checklist based on enabled tenant modules */
export function DashboardSetupChecklist({ enabledModules }: DashboardSetupChecklistProps) {
  const [dismissed, setDismissed] = useState(false)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())

  // Persist completion in localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('setupChecklist:completed')
      if (stored) setCompletedIds(new Set(JSON.parse(stored) as string[]))
    } catch { /* ignore */ }
  }, [])

  function markDone(id: string) {
    setCompletedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      try { localStorage.setItem('setupChecklist:completed', JSON.stringify(Array.from(next))) } catch { /* ignore */ }
      return next
    })
  }

  if (dismissed) return null

  const enabled = new Set(enabledModules)
  const groups  = buildChecklistGroups(enabled)
  if (groups.length === 0) return null

  const totalItems     = groups.flatMap((g) => g.items).length
  const completedCount = groups.flatMap((g) => g.items).filter((i) => completedIds.has(i.id)).length
  const allDone        = completedCount >= totalItems

  if (allDone) return null

  return (
    <div className="rounded-2xl border border-graphite-600 bg-graphite-900/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-graphite-700">
        <div>
          <h3 className="text-sm font-semibold text-white">
            Setup checklist
          </h3>
          <p className="text-xs text-white/40 mt-0.5">
            {completedCount} of {totalItems} steps complete
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Progress ring */}
          <div className="relative h-8 w-8">
            <svg className="h-8 w-8 -rotate-90" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
              <circle
                cx="16" cy="16" r="12" fill="none"
                stroke="#c9a84c"
                strokeWidth="3"
                strokeDasharray={`${75.4 * (completedCount / totalItems)} 75.4`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gold-400">
              {Math.round((completedCount / totalItems) * 100)}%
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-white/25 hover:text-white/60 transition-colors text-sm"
            aria-label="Dismiss setup checklist"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Groups */}
      <div className="divide-y divide-graphite-800">
        {groups.map((group) => (
          <ChecklistGroupSection
            key={group.module}
            group={group}
            completedIds={completedIds}
            onMarkDone={markDone}
          />
        ))}
      </div>
    </div>
  )
}

function ChecklistGroupSection({
  group, completedIds, onMarkDone,
}: {
  group:        ChecklistGroup
  completedIds: Set<string>
  onMarkDone:   (id: string) => void
}) {
  const [open, setOpen] = useState(true)
  const done = group.items.filter((i) => completedIds.has(i.id)).length
  const allDone = done === group.items.length

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-graphite-800/40 transition-colors"
      >
        <span className="text-base">{group.icon}</span>
        <span className={cn('flex-1 text-left text-sm font-medium', allDone ? 'text-white/40 line-through' : 'text-white')}>
          {group.title}
        </span>
        <span className="text-xs text-white/30">{done}/{group.items.length}</span>
        <span className={cn('text-white/30 text-xs transition-transform', open ? 'rotate-90' : '')}>›</span>
      </button>

      {open && (
        <ul className="px-5 pb-3 space-y-1.5">
          {group.items.map((item) => {
            const isDone = completedIds.has(item.id)
            return (
              <li key={item.id} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onMarkDone(item.id)}
                  className={cn(
                    'h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all',
                    isDone
                      ? 'bg-green-500 border-green-500'
                      : 'border-graphite-500 hover:border-gold-400'
                  )}
                >
                  {isDone && (
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <Link
                  href={item.href}
                  className={cn(
                    'text-sm flex-1 hover:text-gold-400 transition-colors',
                    isDone ? 'text-white/30 line-through' : 'text-white/70'
                  )}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Checklist content by module ───────────────────────────────────────────────

function buildChecklistGroups(enabledModules: Set<string>): ChecklistGroup[] {
  const groups: ChecklistGroup[] = []

  if (enabledModules.has('appointments')) {
    groups.push({
      module: 'appointments', icon: '📅', title: 'Set up Appointments',
      items: [
        { id: 'appt:hours',       label: 'Set your business hours',          href: '/settings/hours' },
        { id: 'appt:services',    label: 'Add your services',                href: '/appointments/services' },
        { id: 'appt:availability',label: 'Configure availability blocks',    href: '/appointments/availability' },
        { id: 'appt:staff',       label: 'Add professionals / staff',        href: '/staff' },
      ],
    })
  }

  if (enabledModules.has('website')) {
    groups.push({
      module: 'website', icon: '🌐', title: 'Build Your Website',
      items: [
        { id: 'web:generate',   label: 'Generate your website',              href: '/website' },
        { id: 'web:images',     label: 'Add business photos and images',     href: '/website/images' },
        { id: 'web:publish',    label: 'Publish your website',               href: '/website/publish' },
        { id: 'web:domain',     label: 'Connect your domain',                href: '/settings/domain' },
      ],
    })
  }

  if (enabledModules.has('payments')) {
    groups.push({
      module: 'payments', icon: '💳', title: 'Set Up Payments',
      items: [
        { id: 'pay:connect',    label: 'Connect Stripe or Square',           href: '/payments/setup' },
        { id: 'pay:invoice',    label: 'Create your first invoice',          href: '/payments/invoices' },
      ],
    })
  }

  if (enabledModules.has('store')) {
    groups.push({
      module: 'store', icon: '🛍️', title: 'Launch Your Store',
      items: [
        { id: 'store:product',  label: 'Add your first product',             href: '/store/products/new' },
        { id: 'store:checkout', label: 'Configure checkout settings',        href: '/store/settings' },
      ],
    })
  }

  if (enabledModules.has('rewards')) {
    groups.push({
      module: 'rewards', icon: '⭐', title: 'Create Rewards Program',
      items: [
        { id: 'rew:program',    label: 'Create your loyalty program',        href: '/rewards/program' },
        { id: 'rew:items',      label: 'Add rewards shop items',             href: '/rewards/shop' },
      ],
    })
  }

  if (enabledModules.has('staff')) {
    groups.push({
      module: 'staff', icon: '👔', title: 'Set Up Staff',
      items: [
        { id: 'staff:invite',   label: 'Invite your first employee',         href: '/staff/invite' },
        { id: 'staff:roles',    label: 'Configure staff roles',              href: '/staff/roles' },
      ],
    })
  }

  if (enabledModules.has('ai_images')) {
    groups.push({
      module: 'ai_images', icon: '🎨', title: 'AI Image Studio',
      items: [
        { id: 'ai:gen',         label: 'Generate your first AI images',      href: '/website/ai-images' },
      ],
    })
  }

  if (enabledModules.has('product_360')) {
    groups.push({
      module: 'product_360', icon: '🔄', title: '360 Product Studio',
      items: [
        { id: 'p360:spin',      label: 'Create your first 360 spin package', href: '/product_360' },
      ],
    })
  }

  // Always: business profile
  groups.unshift({
    module: 'profile', icon: '🏢', title: 'Complete Your Profile',
    items: [
      { id: 'prof:name',        label: 'Add your business logo',             href: '/settings/branding' },
      { id: 'prof:hours',       label: 'Set your contact information',       href: '/settings' },
    ],
  })

  return groups
}
