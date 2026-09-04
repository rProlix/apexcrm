'use client'

import { useState, useTransition } from 'react'
import type { RewardsProgram } from '@/types/rewards'

export function RewardsSettingsClient({ program }: { program: RewardsProgram }) {
  const branding = program.branding ?? {}
  const policy = program.expiration_policy ?? { type: 'never' as const }
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const expirationType = String(form.get('expiration_type'))
    const days = Number(form.get('expiration_days'))
    const body = {
      program_type: String(form.get('program_type')),
      points_name: String(form.get('points_name')),
      points_abbreviation: String(form.get('points_abbreviation')),
      earning_enabled: form.get('earning_enabled') === 'on',
      redemption_enabled: form.get('redemption_enabled') === 'on',
      wallet_enabled: form.get('wallet_enabled') === 'on',
      expiration_policy:
        expirationType === 'never' ? { type: 'never' } : { type: expirationType, days },
      branding: {
        program_name: String(form.get('program_name')),
        background_color: String(form.get('background_color')),
        foreground_color: String(form.get('foreground_color')),
        label_color: String(form.get('label_color')),
        card_description: String(form.get('card_description')),
        support_url: String(form.get('support_url')),
        logo_url: String(form.get('logo_url')),
        terms: String(form.get('terms')),
        barcode_enabled: form.get('barcode_enabled') === 'on',
      },
    }
    startTransition(async () => {
      const response = await fetch(`/api/rewards/programs/${program.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setMessage(response.ok ? 'Settings saved.' : (await response.json()).error || 'Save failed')
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <h2 className="font-medium text-white">General</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Program type">
            <select
              name="program_type"
              defaultValue={program.program_type ?? 'points'}
              className="store-input rounded-xl px-3 py-2.5"
            >
              <option value="points">Points</option>
              <option value="punches">Punches</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </Field>
          <Field label="Points name">
            <input
              name="points_name"
              defaultValue={program.points_name ?? 'points'}
              className="store-input rounded-xl px-3 py-2.5"
            />
          </Field>
          <Field label="Abbreviation">
            <input
              name="points_abbreviation"
              defaultValue={program.points_abbreviation ?? 'pts'}
              className="store-input rounded-xl px-3 py-2.5"
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-5">
          <Check
            name="earning_enabled"
            label="Earning enabled"
            value={program.earning_enabled !== false}
          />
          <Check
            name="redemption_enabled"
            label="Redemption enabled"
            value={program.redemption_enabled !== false}
          />
        </div>
      </section>
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <h2 className="font-medium text-white">Expiration</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Policy">
            <select
              name="expiration_type"
              defaultValue={policy.type}
              className="store-input rounded-xl px-3 py-2.5"
            >
              <option value="never">Never</option>
              <option value="rolling">Rolling</option>
              <option value="inactivity">Inactivity</option>
            </select>
          </Field>
          <Field label="Days">
            <input
              name="expiration_days"
              type="number"
              min="1"
              defaultValue={'days' in policy ? policy.days : 365}
              className="store-input rounded-xl px-3 py-2.5"
            />
          </Field>
        </div>
      </section>
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <h2 className="font-medium text-white">Apple Wallet and branding</h2>
        <p className="mt-1 text-xs text-white/40">
          The platform owner manages signing certificates. Tenant admins control only their card
          appearance.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Program name">
            <input
              name="program_name"
              defaultValue={branding.program_name ?? program.name}
              className="store-input rounded-xl px-3 py-2.5"
            />
          </Field>
          <Field label="Background color">
            <input
              name="background_color"
              type="color"
              defaultValue={branding.background_color ?? '#121214'}
              className="store-input h-11 rounded-xl p-1"
            />
          </Field>
          <Field label="Text color">
            <input
              name="foreground_color"
              type="color"
              defaultValue={branding.foreground_color ?? '#ffffff'}
              className="store-input h-11 rounded-xl p-1"
            />
          </Field>
          <Field label="Label color">
            <input
              name="label_color"
              type="color"
              defaultValue={branding.label_color ?? '#d6b253'}
              className="store-input h-11 rounded-xl p-1"
            />
          </Field>
          <Field label="Logo URL">
            <input
              name="logo_url"
              type="url"
              defaultValue={branding.logo_url ?? ''}
              placeholder="Supabase Storage or Vercel HTTPS URL"
              className="store-input rounded-xl px-3 py-2.5"
            />
          </Field>
          <Field label="Support URL">
            <input
              name="support_url"
              type="url"
              defaultValue={branding.support_url ?? ''}
              className="store-input rounded-xl px-3 py-2.5"
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-4">
          <Field label="Card description">
            <input
              name="card_description"
              defaultValue={branding.card_description ?? ''}
              className="store-input rounded-xl px-3 py-2.5"
            />
          </Field>
          <Field label="Terms">
            <textarea
              name="terms"
              defaultValue={branding.terms ?? ''}
              rows={3}
              className="store-input resize-none rounded-xl px-3 py-2.5"
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-5">
          <Check
            name="wallet_enabled"
            label="Apple Wallet enabled"
            value={program.wallet_enabled === true}
          />
          <Check
            name="barcode_enabled"
            label="Barcode enabled"
            value={branding.barcode_enabled !== false}
          />
        </div>
      </section>
      {message && <p className="text-sm text-white/60">{message}</p>}
      <button
        disabled={pending}
        className="rounded-xl bg-gold-400 px-5 py-2.5 text-sm font-semibold text-graphite-950 disabled:opacity-50"
      >
        {pending ? 'Saving...' : 'Save settings'}
      </button>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs text-white/50">{label}</span>
      {children}
    </label>
  )
}
function Check({ name, label, value }: { name: string; label: string; value: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-white/60">
      <input
        name={name}
        type="checkbox"
        defaultChecked={value}
        className="h-4 w-4 accent-gold-400"
      />
      {label}
    </label>
  )
}
