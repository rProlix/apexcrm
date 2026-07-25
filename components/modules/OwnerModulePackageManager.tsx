'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive,
  Check,
  ChevronDown,
  Edit3,
  Loader2,
  PackageCheck,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { slugifyPackageName } from '@/lib/module-packages/policy'
import type { OwnerModulePackage, PackageApplication } from '@/lib/module-packages/service'
import type { ModuleKey } from '@/modules/shared/moduleTypes'
import { EmptyState } from '@/components/ui/StatePanel'
import { StatusBadge } from '@/components/ui/StatusBadge'

interface TenantOption {
  id: string
  name: string
  slug: string
  status: string
}

interface ModuleOption {
  key: ModuleKey
  label: string
  description: string
}

interface PackageDraft {
  id: string | null
  name: string
  slug: string
  description: string
  benefits: string
  moduleKeys: ModuleKey[]
}

const EMPTY_DRAFT: PackageDraft = {
  id: null,
  name: '',
  slug: '',
  description: '',
  benefits: '',
  moduleKeys: [],
}

export function OwnerModulePackageManager({
  packages: initialPackages,
  tenants,
  modules,
  applications,
}: {
  packages: OwnerModulePackage[]
  tenants: TenantOption[]
  modules: ModuleOption[]
  applications: PackageApplication[]
}) {
  const router = useRouter()
  const [packages, setPackages] = useState(initialPackages)
  const [draft, setDraft] = useState<PackageDraft | null>(null)
  const [selectedTenantId, setSelectedTenantId] = useState(tenants[0]?.id ?? '')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [previewPackageId, setPreviewPackageId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const visiblePackages = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return packages.filter((pkg) => {
      if (!showArchived && pkg.status === 'archived') return false
      if (!needle) return true
      return [pkg.name, pkg.slug, pkg.description, ...pkg.benefits].some((value) =>
        value.toLowerCase().includes(needle)
      )
    })
  }, [packages, search, showArchived])

  function editPackage(pkg: OwnerModulePackage) {
    setMessage(null)
    setDraft({
      id: pkg.id,
      name: pkg.name,
      slug: pkg.slug,
      description: pkg.description,
      benefits: pkg.benefits.join(', '),
      moduleKeys: pkg.moduleKeys,
    })
  }

  function updateDraft<K extends keyof PackageDraft>(key: K, value: PackageDraft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  function toggleModule(moduleKey: ModuleKey) {
    if (!draft) return
    updateDraft(
      'moduleKeys',
      draft.moduleKeys.includes(moduleKey)
        ? draft.moduleKeys.filter((key) => key !== moduleKey)
        : [...draft.moduleKeys, moduleKey]
    )
  }

  async function savePackage() {
    if (!draft) return
    setBusyKey('save')
    setMessage(null)
    try {
      const response = await fetch('/api/owner/module-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draft.id,
          name: draft.name,
          slug: draft.slug || slugifyPackageName(draft.name),
          description: draft.description,
          benefits: draft.benefits.split(','),
          moduleKeys: draft.moduleKeys,
        }),
      })
      const result = (await response.json()) as { id?: string; error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Could not save package.')

      const refreshed = await fetch('/api/owner/module-packages', { cache: 'no-store' })
      const refreshedResult = (await refreshed.json()) as {
        packages?: OwnerModulePackage[]
        error?: string
      }
      if (!refreshed.ok || !refreshedResult.packages) {
        throw new Error(refreshedResult.error ?? 'Package saved, but refresh failed.')
      }
      setPackages(refreshedResult.packages)
      setDraft(null)
      setMessage({ tone: 'success', text: 'Package saved.' })
      router.refresh()
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not save package.',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function archivePackage(pkg: OwnerModulePackage) {
    if (
      !window.confirm(`Archive ${pkg.name}? Existing businesses will keep their current modules.`)
    ) {
      return
    }
    setBusyKey(`archive:${pkg.id}`)
    setMessage(null)
    try {
      const response = await fetch(`/api/owner/module-packages/${pkg.id}`, { method: 'DELETE' })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Could not archive package.')
      setPackages((current) =>
        current.map((item) => (item.id === pkg.id ? { ...item, status: 'archived' } : item))
      )
      setMessage({ tone: 'success', text: `${pkg.name} was archived.` })
      router.refresh()
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not archive package.',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function applyPackage(pkg: OwnerModulePackage) {
    const tenant = tenants.find((item) => item.id === selectedTenantId)
    if (!tenant) {
      setMessage({ tone: 'error', text: 'Choose a business first.' })
      return
    }
    setBusyKey(`apply:${pkg.id}`)
    setMessage(null)
    try {
      const response = await fetch(`/api/owner/module-packages/${pkg.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tenant.id }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Could not apply package.')
      setMessage({ tone: 'success', text: `${pkg.name} is now active for ${tenant.name}.` })
      setPreviewPackageId(null)
      router.refresh()
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not apply package.',
      })
    } finally {
      setBusyKey(null)
    }
  }

  const previewPackage = packages.find((pkg) => pkg.id === previewPackageId) ?? null
  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) ?? null

  return (
    <div className="space-y-6">
      <section className="ui-surface p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-white/35">
                Apply packages to
              </span>
              <span className="relative block">
                <select
                  value={selectedTenantId}
                  onChange={(event) => {
                    setSelectedTenantId(event.target.value)
                    setPreviewPackageId(null)
                  }}
                  className="ui-input w-full appearance-none px-4 py-3 pr-9"
                >
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.slug})
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-white/30" />
              </span>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-white/35">
                Find a package
              </span>
              <span className="relative block">
                <Search className="absolute left-3 top-3.5 h-4 w-4 text-white/25" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search packages…"
                  className="ui-input w-full py-3 pl-10 pr-4"
                />
              </span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowArchived((value) => !value)}
              className={cn(
                'ui-button ui-button-secondary',
                showArchived
                  ? 'border-white/20 bg-white/10 text-white'
                  : 'border-white/10 text-white/45 hover:text-white'
              )}
            >
              {showArchived ? 'Hide archived' : 'Show archived'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMessage(null)
                setDraft(EMPTY_DRAFT)
              }}
              className="ui-button ui-button-primary"
            >
              <Plus className="h-4 w-4" />
              New package
            </button>
          </div>
        </div>

        {message && (
          <div
            className={cn(
              'mt-4 rounded-xl border px-4 py-3 text-sm',
              message.tone === 'success'
                ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200'
                : 'border-red-500/20 bg-red-500/5 text-red-200'
            )}
            role="status"
          >
            {message.text}
          </div>
        )}
      </section>

      {draft && (
        <section className="ui-surface border-[color:var(--tenant-accent)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-widest text-gold-400/70">
                Package builder
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                {draft.id ? 'Edit package' : 'Create package'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-lg p-2 text-white/35 hover:bg-white/5 hover:text-white"
              aria-label="Close package builder"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Field label="Package name">
              <input
                value={draft.name}
                onChange={(event) => {
                  const name = event.target.value
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          name,
                          slug: current.id ? current.slug : slugifyPackageName(name),
                        }
                      : current
                  )
                }}
                maxLength={80}
                className={inputClass}
                placeholder="Fleet Enterprise"
              />
            </Field>
            <Field label="Slug">
              <input
                value={draft.slug}
                onChange={(event) => updateDraft('slug', event.target.value.toLowerCase())}
                maxLength={80}
                className={inputClass}
                placeholder="fleet-enterprise"
              />
            </Field>
            <Field label="Description" className="lg:col-span-2">
              <textarea
                value={draft.description}
                onChange={(event) => updateDraft('description', event.target.value)}
                maxLength={500}
                rows={3}
                className={cn(inputClass, 'resize-y')}
                placeholder="Describe the businesses and workflow this package serves."
              />
            </Field>
            <Field label="Customer-facing benefits" className="lg:col-span-2">
              <input
                value={draft.benefits}
                onChange={(event) => updateDraft('benefits', event.target.value)}
                className={inputClass}
                placeholder="Fleet, Van Damage AI, Reports, Staff activity"
              />
              <p className="mt-1.5 text-xs text-white/25">Separate benefits with commas.</p>
            </Field>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/35">
              Modules enabled by this package
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {modules.map((module) => {
                const selected = draft.moduleKeys.includes(module.key)
                return (
                  <button
                    key={module.key}
                    type="button"
                    onClick={() => toggleModule(module.key)}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                      selected
                        ? 'border-gold-500/35 bg-gold-500/8'
                        : 'border-white/8 bg-black/10 hover:border-white/15'
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                        selected
                          ? 'border-gold-400 bg-gold-400 text-graphite-950'
                          : 'border-white/15 text-transparent'
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-white/75">
                        {module.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-white/30">
                        {module.description}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="ui-button ui-button-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={savePackage}
              disabled={busyKey === 'save'}
              className="ui-button ui-button-primary"
            >
              {busyKey === 'save' && <Loader2 className="h-4 w-4 animate-spin" />}
              Save package
            </button>
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        {visiblePackages.map((pkg) => (
          <article
            key={pkg.id}
            className={cn(
              'ui-surface p-5',
              pkg.status === 'archived' ? 'border-white/6 opacity-60' : 'border-white/10'
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-white">{pkg.name}</h2>
                  {pkg.status === 'archived' && <StatusBadge status="archived" label="Archived" />}
                </div>
                <p className="mt-1 font-mono text-2xs text-white/25">{pkg.slug}</p>
              </div>
              {pkg.status === 'active' && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => editPackage(pkg)}
                    className="rounded-lg p-2 text-white/35 hover:bg-white/5 hover:text-white"
                    aria-label={`Edit ${pkg.name}`}
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => archivePackage(pkg)}
                    disabled={busyKey === `archive:${pkg.id}`}
                    className="rounded-lg p-2 text-white/35 hover:bg-red-500/10 hover:text-red-300"
                    aria-label={`Archive ${pkg.name}`}
                  >
                    {busyKey === `archive:${pkg.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                  </button>
                </div>
              )}
            </div>

            <p className="mt-4 text-sm leading-relaxed text-white/45">{pkg.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {pkg.benefits.map((benefit) => (
                <span
                  key={benefit}
                  className="rounded-lg border border-white/8 bg-white/[0.025] px-2.5 py-1 text-xs text-white/50"
                >
                  {benefit}
                </span>
              ))}
            </div>
            <div className="mt-5 border-t border-white/6 pt-4">
              <p className="text-2xs font-semibold uppercase tracking-widest text-white/25">
                {pkg.moduleKeys.length} enabled modules
              </p>
              <p className="mt-2 text-xs text-white/40">
                {pkg.moduleKeys
                  .map((key) => modules.find((module) => module.key === key)?.label ?? key)
                  .join(' · ')}
              </p>
            </div>
            {pkg.status === 'active' && (
              <button
                type="button"
                onClick={() => setPreviewPackageId(pkg.id)}
                disabled={!selectedTenantId || busyKey === `apply:${pkg.id}`}
                className="ui-button ui-button-secondary mt-5 w-full"
              >
                {busyKey === `apply:${pkg.id}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PackageCheck className="h-4 w-4" />
                )}
                Review and apply
              </button>
            )}
          </article>
        ))}
        {visiblePackages.length === 0 && (
          <div className="lg:col-span-2">
            <EmptyState
              title="No packages found"
              description="No packages match the current search."
            />
          </div>
        )}
      </section>

      {previewPackage && selectedTenant && (
        <section
          className="ui-surface border-[color:var(--tenant-accent)] p-5"
          aria-labelledby="package-application-preview"
        >
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <p className="ui-eyebrow">Application preview</p>
              <h2
                id="package-application-preview"
                className="mt-1 text-lg font-semibold text-white"
              >
                {previewPackage.name} → {selectedTenant.name}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
                This controlled change enables the package modules and disables all other registered
                modules for this business. Existing module data and configuration are preserved.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPreviewPackageId(null)}
              className="ui-button ui-button-ghost"
              aria-label="Close application preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="ui-surface-muted p-4">
              <h3 className="text-sm font-semibold text-emerald-200">
                Enable ({previewPackage.moduleKeys.length})
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-[var(--text-primary)]">
                {previewPackage.moduleKeys.map((key) => (
                  <li key={key} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-300" />
                    {modules.find((module) => module.key === key)?.label ?? key}
                  </li>
                ))}
              </ul>
            </div>
            <div className="ui-surface-muted p-4">
              <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
                Disable ({modules.length - previewPackage.moduleKeys.length})
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                {modules
                  .filter((module) => !previewPackage.moduleKeys.includes(module.key))
                  .map((module) => (
                    <li key={module.key} className="flex items-center gap-2">
                      <X className="h-4 w-4 text-[var(--text-tertiary)]" />
                      {module.label}
                    </li>
                  ))}
              </ul>
            </div>
          </div>
          <p className="mt-4 text-xs text-amber-100">
            Confirm that users in {selectedTenant.name} are ready for this navigation and workflow
            change.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setPreviewPackageId(null)}
              className="ui-button ui-button-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void applyPackage(previewPackage)}
              disabled={busyKey === `apply:${previewPackage.id}`}
              className="ui-button ui-button-primary"
            >
              {busyKey === `apply:${previewPackage.id}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PackageCheck className="h-4 w-4" />
              )}
              Confirm application
            </button>
          </div>
        </section>
      )}

      <section className="ui-surface p-5">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-4 w-4 text-gold-400" />
          <h2 className="text-sm font-semibold text-white">Recent package applications</h2>
        </div>
        <div className="mt-4 divide-y divide-white/5">
          {applications.length === 0 ? (
            <p className="py-5 text-center text-xs text-white/30">
              No packages have been applied yet.
            </p>
          ) : (
            applications.map((application) => (
              <div
                key={application.id}
                className="flex flex-col justify-between gap-1 py-3 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="text-sm text-white/65">
                    <span className="font-medium text-white">{application.packageName}</span>{' '}
                    applied to {application.tenantName}
                  </p>
                  <p className="mt-1 text-xs text-white/25">
                    {application.appliedModules.length} modules enabled
                  </p>
                </div>
                <time className="text-xs text-white/25">
                  {new Intl.DateTimeFormat('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(application.appliedAt))}
                </time>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={cn('space-y-2', className)}>
      <span className="text-xs font-semibold uppercase tracking-widest text-white/35">{label}</span>
      {children}
    </label>
  )
}

const inputClass = 'ui-input w-full px-4 py-3'
