'use client'
// components/website/canva/EventRsvpForm.tsx
// Mobile-friendly RSVP form for converted Canva PDF event websites.

import { useState } from 'react'

interface Props {
  eventSlug: string
  title?: string
  theme?: Record<string, unknown>
  cameraHref?: string | null
  galleryHref?: string | null
}

export function EventRsvpForm({ eventSlug, title, theme, cameraHref, galleryHref }: Props) {
  const colors = (theme?.colors as Record<string, string>) ?? {}
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [attending, setAttending] = useState<boolean | null>(true)
  const [guestCount, setGuestCount] = useState(1)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Please enter your name.'); return }
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventSlug)}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() || null, phone: phone.trim() || null, attending, guest_count: guestCount, message: message.trim() || null }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error ?? 'Could not submit RSVP')
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '2rem 1.25rem', textAlign: 'center', color: colors.text ?? '#fff' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Thank you!</h1>
        <p style={{ opacity: 0.85, marginTop: '0.75rem' }}>Your RSVP has been received.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem' }}>
          {cameraHref && <a href={cameraHref} style={btnStyle(colors)}>Open Event Camera</a>}
          {galleryHref && <a href={galleryHref} style={btnStyle(colors)}>View Gallery</a>}
          <a href={`/events/${eventSlug}`} style={btnStyle(colors, true)}>Back to event</a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '2rem 1.25rem', color: colors.text ?? '#fff' }}>
      <h1 style={{ fontSize: 'clamp(1.5rem,4vw,2rem)', fontWeight: 700, textAlign: 'center' }}>{title ?? 'RSVP'}</h1>
      <p style={{ textAlign: 'center', opacity: 0.75, marginTop: '0.5rem' }}>Please let us know if you can make it.</p>
      <form onSubmit={submit} style={{ marginTop: '1.5rem', display: 'grid', gap: '1rem' }}>
        <Field label="Name *" value={name} onChange={setName} />
        <Field label="Email" value={email} onChange={setEmail} type="email" />
        <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
        <label style={labelStyle}>
          Attending?
          <div style={{ display: 'flex', gap: '1rem', marginTop: 6 }}>
            <button type="button" onClick={() => setAttending(true)} style={pill(attending === true, colors)}>Yes</button>
            <button type="button" onClick={() => setAttending(false)} style={pill(attending === false, colors)}>No</button>
          </div>
        </label>
        <Field label="Guest count" value={String(guestCount)} onChange={(v) => setGuestCount(Math.max(1, parseInt(v, 10) || 1))} type="number" />
        <label style={labelStyle}>
          Message
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} style={inputStyle} />
        </label>
        {error && <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{error}</p>}
        <button type="submit" disabled={busy} style={{ ...btnStyle(colors), width: '100%', border: 'none', cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Submitting…' : 'Submit RSVP'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label style={labelStyle}>
      {label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  )
}

const labelStyle: React.CSSProperties = { display: 'grid', gap: 6, fontSize: '0.875rem', fontWeight: 500 }
const inputStyle: React.CSSProperties = { marginTop: 4, padding: '0.65rem 0.85rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: 'inherit', width: '100%' }

function btnStyle(colors: Record<string, string>, outline = false): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.75rem 1.25rem', borderRadius: 999,
    fontWeight: 600, textDecoration: 'none', fontSize: '0.9rem',
    background: outline ? 'transparent' : `linear-gradient(135deg,${colors.primary ?? '#7c3aed'},${colors.accent ?? '#db2777'})`,
    border: outline ? '1px solid rgba(255,255,255,0.3)' : 'none',
    color: '#fff',
  }
}

function pill(active: boolean, colors: Record<string, string>): React.CSSProperties {
  return {
    padding: '0.4rem 1rem', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 600,
    background: active ? (colors.primary ?? '#7c3aed') : 'rgba(255,255,255,0.1)', color: '#fff',
  }
}
