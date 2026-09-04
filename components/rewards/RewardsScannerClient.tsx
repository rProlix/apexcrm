'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, Keyboard, ScanLine, X } from 'lucide-react'

export function RewardsScannerClient() {
  const [token, setToken] = useState('')
  const [camera, setCamera] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [points, setPoints] = useState('')
  const video = useRef<HTMLVideoElement>(null)
  const controls = useRef<{ stop(): void } | null>(null)
  useEffect(() => () => controls.current?.stop(), [])
  async function startCamera() {
    setError('')
    setCamera(true)
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      if (!video.current) return
      controls.current = await reader.decodeFromVideoDevice(undefined, video.current, (scan) => {
        if (scan) {
          const value = scan.getText()
          setToken(value)
          controls.current?.stop()
          setCamera(false)
          void lookup(value)
        }
      })
    } catch {
      setError('Camera access is unavailable. Enter the code manually.')
      setCamera(false)
    }
  }
  async function lookup(value = token, action = 'lookup', extra: Record<string, unknown> = {}) {
    if (!value.trim()) {
      setError('Enter or scan a rewards code.')
      return
    }
    setBusy(true)
    setError('')
    setResult(null)
    const response = await fetch('/api/rewards/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: value.trim(),
        action,
        idempotency_key: `scan:${crypto.randomUUID()}`,
        ...extra,
      }),
    })
    const body = await response.json()
    setBusy(false)
    if (!response.ok) {
      setError(body.error || 'Scan failed')
      return
    }
    setResult(body)
  }
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-white">
          <ScanLine className="h-6 w-6 text-gold-300" />
          Rewards scanner
        </h1>
        <p className="mt-1 text-sm text-white/40">
          Identify members and securely redeem one-time reward credentials.
        </p>
      </header>
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        {camera ? (
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video ref={video} className="aspect-video w-full object-cover" muted playsInline />
            <button
              onClick={() => {
                controls.current?.stop()
                setCamera(false)
              }}
              className="absolute right-3 top-3 rounded-lg bg-black/60 p-2 text-white"
              aria-label="Stop camera"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => void startCamera()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gold-400/25 bg-gold-400/10 py-4 text-sm font-medium text-gold-200"
          >
            <Camera className="h-5 w-5" />
            Start camera
          </button>
        )}
        <div className="my-4 flex items-center gap-3 text-xs text-white/30">
          <span className="h-px flex-1 bg-white/10" />
          or enter manually
          <span className="h-px flex-1 bg-white/10" />
        </div>
        <label className="grid gap-2">
          <span className="flex items-center gap-2 text-xs text-white/50">
            <Keyboard className="h-3.5 w-3.5" />
            Rewards code
          </span>
          <div className="flex gap-2">
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="store-input min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm"
              autoComplete="off"
            />
            <button
              disabled={busy}
              onClick={() => void lookup()}
              className="rounded-xl bg-gold-400 px-4 text-sm font-semibold text-graphite-950 disabled:opacity-50"
            >
              {busy ? 'Checking...' : 'Lookup'}
            </button>
          </div>
        </label>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>
      {result?.kind === 'membership' && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <p className="text-xs text-white/40">{result.member.membership_number}</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{result.member.customer_name}</h2>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div>
              <p className="text-2xl font-semibold text-gold-300">
                {Number(result.member.points_balance).toLocaleString()}
              </p>
              <p className="text-xs text-white/40">Points</p>
            </div>
            <div>
              <p className="text-lg font-medium text-white">{result.member.tier ?? 'Member'}</p>
              <p className="text-xs text-white/40">Tier</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-[1fr_auto]">
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason for manual award"
              className="store-input rounded-xl px-3 py-2.5 text-sm"
            />
            <div className="flex gap-2">
              <input
                value={points}
                onChange={(event) => setPoints(event.target.value)}
                type="number"
                min="1"
                max="100000"
                placeholder="Points"
                className="store-input w-28 rounded-xl px-3 py-2.5 text-sm"
              />
              <button
                disabled={busy || !reason.trim()}
                onClick={() =>
                  void lookup(token, 'award_points', { points: Number(points), reason })
                }
                className="rounded-xl border border-gold-400/30 px-3 text-sm text-gold-200 disabled:opacity-40"
              >
                Award
              </button>
            </div>
          </div>
          {result.member.punch_definitions?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {result.member.punch_definitions.map((definition: { id: string; name: string }) => (
                <button
                  key={definition.id}
                  disabled={busy || !reason.trim()}
                  onClick={() =>
                    void lookup(token, 'add_punch', {
                      definition_id: definition.id,
                      punches: 1,
                      reason,
                    })
                  }
                  className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 disabled:opacity-40"
                >
                  Add punch to {definition.name}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      {result?.kind === 'redemption' && (
        <section className="rounded-2xl border border-gold-400/20 bg-gold-400/[0.06] p-5">
          <CheckCircle2 className="h-6 w-6 text-gold-300" />
          <h2 className="mt-3 font-semibold text-white">
            {result.redemption?.reward_name ?? 'Reward'}
          </h2>
          <p className="mt-1 text-sm capitalize text-white/45">
            {result.status ?? result.redemption?.status}
          </p>
          {result.redemption && ['available', 'claimed'].includes(result.redemption.status) && (
            <button
              onClick={() => void lookup(token, 'redeem')}
              className="mt-5 rounded-xl bg-gold-400 px-4 py-2.5 text-sm font-semibold text-graphite-950"
            >
              Confirm redemption
            </button>
          )}
        </section>
      )}
      {result?.kind === 'membership_action' && (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5 text-sm text-emerald-200">
          <CheckCircle2 className="mb-2 h-5 w-5" />
          Reward activity recorded. Scan or enter the membership again to refresh the balance.
        </section>
      )}
    </div>
  )
}
