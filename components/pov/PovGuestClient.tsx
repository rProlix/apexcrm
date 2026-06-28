'use client'
// components/pov/PovGuestClient.tsx
// The full public guest experience for a POV Event App:
//   auth (phone + PIN)  →  capture (photo / 15s video / 30s audio)  →  gallery
// Mobile-first, QR-friendly, premium event styling. No secrets touch the client.

import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface PublicEvent {
  id: string; name: string; slug: string; event_type: string | null
  event_date: string | null; timezone: string; gallery_reveal_at: string
  is_active: boolean; allow_photos: boolean; allow_videos: boolean; allow_audio: boolean
  video_max_seconds: number; audio_max_seconds: number; require_pin: boolean
  allow_guest_login: boolean; allow_guest_registration: boolean
  gallery_locked_message: string; gallery_unlocked_message: string
  theme: Record<string, unknown>
  headline: string | null; subheadline: string | null
  upload_instructions: string | null; upload_success_message: string | null
  unlocked: boolean
}
interface GuestInfo { id: string; display_name: string | null }
type MediaItem = {
  id: string; media_type: 'photo' | 'video' | 'audio'; public_url: string | null
  caption: string | null; guest_name?: string | null; created_at: string
}
type View = 'auth' | 'capture' | 'gallery'

// ─── Theme palettes ─────────────────────────────────────────────────────────
const PALETTES: Record<string, { bg: string; panel: string; accent: string; text: string; sub: string }> = {
  disposable:        { bg: '#0c0c0d', panel: 'rgba(255,255,255,0.04)', accent: '#f5c518', text: '#fafafa', sub: 'rgba(255,255,255,0.55)' },
  wedding_elegant:   { bg: '#13100c', panel: 'rgba(255,255,255,0.05)', accent: '#d8b46b', text: '#fdf8ef', sub: 'rgba(253,248,239,0.6)' },
  baby_pastel:       { bg: '#1a1620', panel: 'rgba(255,255,255,0.06)', accent: '#f2a9c4', text: '#fff', sub: 'rgba(255,255,255,0.6)' },
  birthday_colorful: { bg: '#0e0f1a', panel: 'rgba(255,255,255,0.05)', accent: '#7c5cff', text: '#fff', sub: 'rgba(255,255,255,0.6)' },
  luxury_black_gold: { bg: '#070707', panel: 'rgba(255,255,255,0.04)', accent: '#caa53d', text: '#fafafa', sub: 'rgba(255,255,255,0.5)' },
}
function palette(themeKey: unknown) {
  const k = typeof themeKey === 'string' ? themeKey : 'disposable'
  return PALETTES[k] ?? PALETTES.disposable
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getMediaDuration(file: File, kind: 'video' | 'audio'): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const el = document.createElement(kind)
      el.preload = 'metadata'
      el.onloadedmetadata = () => {
        const d = el.duration
        URL.revokeObjectURL(el.src)
        resolve(Number.isFinite(d) ? d : null)
      }
      el.onerror = () => resolve(null)
      el.src = URL.createObjectURL(file)
    } catch { resolve(null) }
  })
}

export function PovGuestClient({ eventSlug, initialView }: { eventSlug: string; initialView: 'auto' | 'capture' | 'gallery' }) {
  const [event, setEvent] = useState<PublicEvent | null>(null)
  const [guest, setGuest] = useState<GuestInfo | null>(null)
  const [view, setView]   = useState<View>('auth')
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    const [evRes, meRes] = await Promise.all([
      fetch(`/api/pov/events/${eventSlug}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/pov/events/${eventSlug}/me`).then((r) => r.json()).catch(() => null),
    ])
    const ev: PublicEvent | null = evRes?.public ?? null
    setEvent(ev)
    const loggedIn = !!(meRes?.loggedIn ?? meRes?.authenticated)
    if (loggedIn) {
      setGuest(meRes.guest)
      setView(initialView === 'gallery' ? 'gallery' : 'capture')
    } else {
      setGuest(null)
      // The gallery is publicly viewable (locked state pre-reveal, media after),
      // so honor a direct /gallery link even when logged out.
      setView(initialView === 'gallery' ? 'gallery' : 'auth')
    }
    setReady(true)
  }, [eventSlug, initialView])

  useEffect(() => { void refresh() }, [refresh])

  const pal = palette(event?.theme?.theme_key)

  if (!ready) {
    return <Shell pal={pal}><p style={{ color: pal.sub }}>Loading…</p></Shell>
  }
  if (!event) {
    return <Shell pal={pal}><p style={{ color: pal.sub }}>This event was not found.</p></Shell>
  }

  return (
    <Shell pal={pal}>
      <div style={{ width: '100%', maxWidth: 460, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 12, letterSpacing: 3, textTransform: 'uppercase', color: pal.accent, fontWeight: 700 }}>
            Event Camera
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: pal.text, margin: '8px 0 4px' }}>{event.name}</h1>
          {event.event_date && <p style={{ color: pal.sub, fontSize: 14 }}>{event.event_date}</p>}
        </div>

        {guest && (
          <Tabs pal={pal} view={view} setView={setView} />
        )}

        {view === 'auth' && (
          <AuthView event={event} pal={pal}
            onAuthed={(g) => { setGuest(g); setView('capture') }}
            onViewGallery={() => setView('gallery')} />
        )}
        {view === 'capture' && guest && (
          <CaptureView event={event} pal={pal} />
        )}
        {view === 'gallery' && (
          <GalleryView eventSlug={eventSlug} pal={pal} />
        )}

        {!guest && view === 'gallery' && (
          <button onClick={() => setView('auth')}
            style={{ display: 'block', width: '100%', maxWidth: 460, margin: '20px auto 0', background: pal.accent, border: 'none', borderRadius: 12, padding: '12px', color: '#111', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Enter the Event Camera
          </button>
        )}

        {guest && (
          <button onClick={async () => { await fetch(`/api/pov/events/${eventSlug}/logout`, { method: 'POST' }); void refresh() }}
            style={{ display: 'block', margin: '28px auto 0', background: 'none', border: 'none', color: pal.sub, fontSize: 12, cursor: 'pointer' }}>
            Leave event
          </button>
        )}
      </div>
    </Shell>
  )
}

// ─── Layout shell ─────────────────────────────────────────────────────────────
function Shell({ children, pal }: { children: React.ReactNode; pal: ReturnType<typeof palette> }) {
  return (
    <div style={{
      minHeight: '100dvh', background: pal.bg, color: pal.text,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px 18px', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    }}>
      {children}
    </div>
  )
}

function Tabs({ pal, view, setView }: { pal: ReturnType<typeof palette>; view: View; setView: (v: View) => void }) {
  const tab = (v: View, label: string) => (
    <button onClick={() => setView(v)} style={{
      flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
      fontSize: 14, fontWeight: 600,
      background: view === v ? pal.accent : 'transparent',
      color: view === v ? '#111' : pal.sub,
    }}>{label}</button>
  )
  return (
    <div style={{ display: 'flex', gap: 6, background: pal.panel, padding: 5, borderRadius: 14, marginBottom: 20 }}>
      {tab('capture', 'Camera')}
      {tab('gallery', 'Gallery')}
    </div>
  )
}

// ─── Auth view (separate Register + Login modes) ──────────────────────────────
function AuthView({ event, pal, onAuthed, onViewGallery }: {
  event: PublicEvent; pal: ReturnType<typeof palette>
  onAuthed: (g: GuestInfo) => void; onViewGallery: () => void
}) {
  // Default to Login when registration is disabled.
  const [mode, setMode] = useState<'register' | 'login'>(
    event.allow_guest_registration ? 'register' : 'login',
  )
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setErr(null)
    if (mode === 'register' && event.require_pin && pin2 && pin !== pin2) {
      setErr('PINs do not match.'); return
    }
    setBusy(true)
    try {
      const path = mode === 'register' ? 'register' : 'login'
      const res = await fetch(`/api/pov/events/${event.slug}/guest/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'register'
            ? { phone_number: phone, pin, display_name: name || undefined }
            : { phone_number: phone, pin },
        ),
      })
      const json = await res.json()
      if (!res.ok) {
        // Helpfully switch tabs based on server hints.
        if (json.code === 'exists') setMode('login')
        if (json.code === 'not_found') setMode('register')
        throw new Error(json.error ?? 'Could not continue')
      }
      onAuthed(json.guest)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false)
    }
  }

  const canRegister = event.allow_guest_registration
  const canLogin = event.allow_guest_login

  return (
    <Panel pal={pal}>
      <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: pal.text }}>
        {event.headline ?? 'Capture the day from your point of view.'}
      </p>
      <p style={{ fontSize: 13, color: pal.sub, marginBottom: 16 }}>
        {mode === 'register'
          ? (event.subheadline ?? 'Create your private guest camera account.')
          : 'Already joined? Log in to keep uploading or view the gallery.'}
      </p>

      {/* Mode tabs */}
      {(canRegister && canLogin) && (
        <div style={{ display: 'flex', gap: 6, background: 'rgba(0,0,0,0.3)', padding: 5, borderRadius: 12, marginBottom: 16 }}>
          <ModeTab pal={pal} active={mode === 'register'} onClick={() => { setMode('register'); setErr(null) }}>Create Guest Account</ModeTab>
          <ModeTab pal={pal} active={mode === 'login'} onClick={() => { setMode('login'); setErr(null) }}>Log In</ModeTab>
        </div>
      )}

      {err && <ErrBox>{err}</ErrBox>}

      <Input pal={pal} label="Phone number" type="tel" inputMode="tel" value={phone}
        onChange={setPhone} placeholder="(555) 123-4567" />
      {event.require_pin && (
        <Input pal={pal} label="PIN (4–8 digits)" type="password" inputMode="numeric" value={pin}
          onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 8))} placeholder="••••" />
      )}
      {mode === 'register' && event.require_pin && (
        <Input pal={pal} label="Confirm PIN" type="password" inputMode="numeric" value={pin2}
          onChange={(v) => setPin2(v.replace(/\D/g, '').slice(0, 8))} placeholder="••••" />
      )}
      {mode === 'register' && (
        <Input pal={pal} label="Display name (optional)" value={name} onChange={setName} placeholder="Your name" />
      )}

      <PrimaryBtn pal={pal} busy={busy} onClick={submit}>
        {mode === 'register' ? 'Enter Event Camera' : 'Continue Uploading'}
      </PrimaryBtn>

      <button onClick={onViewGallery}
        style={{ display: 'block', width: '100%', marginTop: 12, background: 'none', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: '11px', color: pal.sub, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        View Gallery
      </button>
    </Panel>
  )
}

function ModeTab({ pal, active, onClick, children }: {
  pal: ReturnType<typeof palette>; active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
      background: active ? pal.accent : 'transparent', color: active ? '#111' : pal.sub,
    }}>{children}</button>
  )
}

// ─── Capture view ─────────────────────────────────────────────────────────────
function CaptureView({ event, pal }: { event: PublicEvent; pal: ReturnType<typeof palette> }) {
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const photoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const audioFileRef = useRef<HTMLInputElement>(null)

  // Video recorder overlay
  const [showVideoRecorder, setShowVideoRecorder] = useState(false)

  // Audio recording
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [mediaRecorderSupported, setMrSupported] = useState(true)

  useEffect(() => {
    setMrSupported(typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  async function uploadFile(file: File, mediaType: 'photo' | 'video' | 'audio', knownDuration?: number | null) {
    setBusy(true); setErr(null); setOk(null)
    try {
      let duration: number | null = knownDuration ?? null
      if ((mediaType === 'video' || mediaType === 'audio') && duration == null) {
        duration = await getMediaDuration(file, mediaType)
      }
      if (mediaType === 'video' || mediaType === 'audio') {
        const max = mediaType === 'video' ? event.video_max_seconds : event.audio_max_seconds
        if (duration != null && duration > max + 2.5) {
          throw new Error(`Please keep it to ${max} seconds or less (yours is ${Math.round(duration)}s).`)
        }
      }
      const fd = new FormData()
      fd.append('file', file)
      fd.append('media_type', mediaType)
      if (caption.trim()) fd.append('caption', caption.trim())
      if (duration != null) fd.append('duration_seconds', String(duration))
      const res = await fetch(`/api/pov/events/${event.slug}/media/upload`, { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      setOk(event.upload_success_message ?? 'Memory saved. The gallery unlocks tomorrow.')
      setCaption('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  function onPick(ref: React.RefObject<HTMLInputElement | null>, mediaType: 'photo' | 'video' | 'audio') {
    const f = ref.current?.files?.[0]
    if (f) void uploadFile(f, mediaType)
    if (ref.current) ref.current.value = ''
  }

  async function startRecording() {
    setErr(null); setOk(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        const ext = (rec.mimeType || 'audio/webm').includes('mp4') ? 'mp4' : 'webm'
        const file = new File([blob], `audio-message.${ext}`, { type: blob.type })
        void uploadFile(file, 'audio')
        setRecording(false); setElapsed(0)
        if (timerRef.current) clearInterval(timerRef.current)
      }
      recorderRef.current = rec
      rec.start()
      setRecording(true); setElapsed(0)
      timerRef.current = setInterval(() => {
        setElapsed((e) => {
          const next = e + 1
          if (next >= event.audio_max_seconds) stopRecording()
          return next
        })
      }, 1000)
    } catch {
      setErr('Microphone access was blocked. You can upload an audio file instead.')
    }
  }
  function stopRecording() {
    try {
      const rec = recorderRef.current
      if (rec && rec.state !== 'inactive') rec.stop()
    } catch { /* noop */ }
  }

  return (
    <Panel pal={pal}>
      {event.upload_instructions && (
        <p style={{ fontSize: 13, color: pal.sub, marginBottom: 16 }}>{event.upload_instructions}</p>
      )}
      {err && <ErrBox>{err}</ErrBox>}
      {ok && (
        <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', borderRadius: 12, padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>{ok}</div>
      )}

      <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={() => onPick(photoRef, 'photo')} />
      <input ref={videoRef} type="file" accept="video/*" capture="environment" hidden onChange={() => onPick(videoRef, 'video')} />
      <input ref={audioFileRef} type="file" accept="audio/*" hidden onChange={() => onPick(audioFileRef, 'audio')} />

      <label style={{ display: 'block', fontSize: 12, color: pal.sub, marginBottom: 6 }}>Caption (optional)</label>
      <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200}
        placeholder="Say something…"
        style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 12, marginBottom: 16,
          background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: pal.text, fontSize: 15 }} />

      <div style={{ display: 'grid', gap: 10 }}>
        {event.allow_photos && (
          <BigBtn pal={pal} disabled={busy} onClick={() => photoRef.current?.click()} emoji="📸"
            title="Take / upload a photo" />
        )}
        {event.allow_videos && (
          <BigBtn pal={pal} disabled={busy}
            onClick={() => (mediaRecorderSupported ? setShowVideoRecorder(true) : videoRef.current?.click())}
            emoji="🎬" title={`Record a ${event.video_max_seconds}s video clip`} />
        )}
        {event.allow_videos && mediaRecorderSupported && (
          <button onClick={() => videoRef.current?.click()} disabled={busy}
            style={{ background: 'none', border: 'none', color: pal.sub, fontSize: 12, cursor: 'pointer', padding: 4 }}>
            …or upload a video file
          </button>
        )}
        {event.allow_audio && (
          recording ? (
            <button onClick={stopRecording} style={{
              padding: '16px', borderRadius: 16, border: '1px solid rgba(239,68,68,0.5)',
              background: 'rgba(239,68,68,0.18)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}>
              ⏹ Stop recording — {event.audio_max_seconds - elapsed}s left
            </button>
          ) : (
            <BigBtn pal={pal} disabled={busy}
              onClick={() => (mediaRecorderSupported ? startRecording() : audioFileRef.current?.click())}
              emoji="🎙️" title={`Record a ${event.audio_max_seconds}s audio message`} />
          )
        )}
        {event.allow_audio && mediaRecorderSupported && (
          <button onClick={() => audioFileRef.current?.click()} disabled={busy}
            style={{ background: 'none', border: 'none', color: pal.sub, fontSize: 12, cursor: 'pointer', padding: 4 }}>
            …or upload an audio file
          </button>
        )}
      </div>

      {busy && <p style={{ textAlign: 'center', color: pal.sub, fontSize: 13, marginTop: 14 }}>Uploading…</p>}

      {showVideoRecorder && (
        <VideoRecorder
          pal={pal}
          maxSeconds={event.video_max_seconds}
          onCancel={() => setShowVideoRecorder(false)}
          onCaptured={(file, dur) => {
            setShowVideoRecorder(false)
            void uploadFile(file, 'video', dur)
          }}
          onUnsupported={() => { setShowVideoRecorder(false); videoRef.current?.click() }}
        />
      )}
    </Panel>
  )
}

// ─── Video recorder (hard-stops at maxSeconds) ────────────────────────────────
function VideoRecorder({ pal, maxSeconds, onCaptured, onCancel, onUnsupported }: {
  pal: ReturnType<typeof palette>; maxSeconds: number
  onCaptured: (file: File, durationSeconds: number) => void
  onCancel: () => void
  onUnsupported: () => void
}) {
  const [phase, setPhase] = useState<'live' | 'recording' | 'recorded'>('live')
  const [elapsed, setElapsed] = useState(0)
  const [err, setErr] = useState<string | null>(null)

  const liveRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hardStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startedAtRef = useRef<number>(0)
  const fileRef = useRef<File | null>(null)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const finalDurRef = useRef<number>(0)

  const pickMime = useCallback((): string => {
    const candidates = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    for (const m of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
    }
    return ''
  }, [])

  const clearTimers = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    if (hardStopRef.current) { clearTimeout(hardStopRef.current); hardStopRef.current = null }
  }, [])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const startCamera = useCallback(async () => {
    setErr(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, audio: true,
      })
      streamRef.current = stream
      if (liveRef.current) {
        liveRef.current.srcObject = stream
        liveRef.current.muted = true
        await liveRef.current.play().catch(() => {})
      }
    } catch {
      setErr('Camera access was blocked. You can upload a video file instead.')
    }
  }, [])

  useEffect(() => {
    void startCamera()
    return () => {
      clearTimers()
      stopStream()
      if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startRecording() {
    if (!streamRef.current) return
    setErr(null)
    const mimeType = pickMime()
    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined)
    } catch {
      onUnsupported(); return
    }
    chunksRef.current = []
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
    rec.onstop = () => {
      clearTimers()
      const type = rec.mimeType || mimeType || 'video/webm'
      const ext = type.includes('mp4') ? 'mp4' : 'webm'
      const blob = new Blob(chunksRef.current, { type })
      const file = new File([blob], `event-clip.${ext}`, { type })
      fileRef.current = file
      finalDurRef.current = Math.min(maxSeconds, (Date.now() - startedAtRef.current) / 1000)
      const url = URL.createObjectURL(blob)
      setRecordedUrl(url)
      setPhase('recorded')
    }
    recorderRef.current = rec
    rec.start()
    startedAtRef.current = Date.now()
    setElapsed(0)
    setPhase('recording')

    // Visible ticking timer.
    intervalRef.current = setInterval(() => {
      const secs = (Date.now() - startedAtRef.current) / 1000
      setElapsed(secs)
      if (secs >= maxSeconds) stopRecording()
    }, 200)
    // Hard-stop safety net at exactly maxSeconds.
    hardStopRef.current = setTimeout(() => stopRecording(), maxSeconds * 1000)
  }

  function stopRecording() {
    clearTimers()
    const rec = recorderRef.current
    try { if (rec && rec.state !== 'inactive') rec.stop() } catch { /* noop */ }
  }

  function retake() {
    if (recordedUrl) { URL.revokeObjectURL(recordedUrl); setRecordedUrl(null) }
    fileRef.current = null
    setElapsed(0)
    setPhase('live')
    void startCamera()
  }

  function cancel() {
    clearTimers(); stopStream()
    if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    onCancel()
  }

  function confirmUpload() {
    if (fileRef.current) {
      stopStream()
      onCaptured(fileRef.current, finalDurRef.current || maxSeconds)
    }
  }

  const remaining = Math.max(0, Math.ceil(maxSeconds - elapsed))
  const fmt = (s: number) => `0:${String(Math.min(maxSeconds, Math.floor(s))).padStart(2, '0')}`
  const limitReached = elapsed >= maxSeconds

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.92)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 14,
    }}>
      {err && <div style={{ maxWidth: 460, width: '100%' }}><ErrBox>{err}</ErrBox></div>}

      <div style={{ position: 'relative', width: '100%', maxWidth: 460, aspectRatio: '3/4', background: '#000', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)' }}>
        {phase !== 'recorded' ? (
          <video ref={liveRef} playsInline muted autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          recordedUrl && <video src={recordedUrl} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}

        {/* Timer overlay */}
        {phase === 'recording' && (
          <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 999, padding: '6px 14px' }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: '#ef4444', display: 'inline-block', animation: 'pulse 1s infinite' }} />
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              Recording… {fmt(elapsed)} / {fmt(maxSeconds)}
            </span>
          </div>
        )}
        {limitReached && phase !== 'recorded' && (
          <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(239,68,68,0.9)', color: '#fff', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>
            Recording limit reached
          </div>
        )}
      </div>

      <p style={{ color: pal.sub, fontSize: 13, textAlign: 'center', maxWidth: 460 }}>
        {phase === 'live' && `Tap record. Clips hard-stop at ${maxSeconds} seconds.`}
        {phase === 'recording' && `${remaining}s left`}
        {phase === 'recorded' && 'Preview your clip'}
      </p>

      <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 460 }}>
        {phase === 'live' && (
          <>
            <button onClick={startRecording} disabled={!!err} style={recBtn('#ef4444')}>● Record</button>
            <button onClick={cancel} style={recBtn('rgba(255,255,255,0.12)')}>Cancel</button>
          </>
        )}
        {phase === 'recording' && (
          <button onClick={stopRecording} style={recBtn('#ef4444')}>⏹ Stop</button>
        )}
        {phase === 'recorded' && (
          <>
            <button onClick={confirmUpload} style={recBtn(pal.accent, '#111')}>Upload clip</button>
            <button onClick={retake} style={recBtn('rgba(255,255,255,0.12)')}>Retake</button>
            <button onClick={cancel} style={recBtn('rgba(255,255,255,0.12)')}>Cancel</button>
          </>
        )}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  )
}

function recBtn(bg: string, color = '#fff'): React.CSSProperties {
  return {
    flex: 1, padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer',
    background: bg, color, fontSize: 15, fontWeight: 700,
  }
}

// ─── Gallery view ──────────────────────────────────────────────────────────────
function GalleryView({ eventSlug, pal }: { eventSlug: string; pal: ReturnType<typeof palette> }) {
  const [data, setData] = useState<{ unlocked: boolean; locked?: boolean; reveal_at: string; message?: string; media: MediaItem[] } | null>(null)
  const [filter, setFilter] = useState<'all' | 'photo' | 'video' | 'audio'>('all')
  const [now, setNow] = useState(Date.now())
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/pov/events/${eventSlug}/media`).then((r) => r.json()).then((j) => {
      if (j.error) setErr(j.error); else setData(j)
    }).catch(() => setErr('Could not load gallery.'))
  }, [eventSlug])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  if (err) return <Panel pal={pal}><ErrBox>{err}</ErrBox></Panel>
  if (!data) return <Panel pal={pal}><p style={{ color: pal.sub }}>Loading…</p></Panel>

  if (!data.unlocked) {
    const remaining = Math.max(0, new Date(data.reveal_at).getTime() - now)
    return (
      <Panel pal={pal}>
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
          <p style={{ fontSize: 18, fontWeight: 700, color: pal.text, marginBottom: 6 }}>
            {data.message ?? 'The gallery is developing. Come back tomorrow.'}
          </p>
          <p style={{ color: pal.sub, fontSize: 13, marginBottom: 18 }}>
            Reveals {new Date(data.reveal_at).toLocaleString()}
          </p>
          <Countdown ms={remaining} pal={pal} />
        </div>
      </Panel>
    )
  }

  const items = filter === 'all' ? data.media : data.media.filter((m) => m.media_type === filter)
  return (
    <div>
      <p style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, color: pal.accent, marginBottom: 14 }}>
        {data.message ?? 'The memories are ready.'}
      </p>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16 }}>
        {(['all', 'photo', 'video', 'audio'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)',
            background: filter === f ? pal.accent : 'transparent', color: filter === f ? '#111' : pal.sub,
            fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
          }}>{f}</button>
        ))}
      </div>
      {items.length === 0 ? (
        <p style={{ textAlign: 'center', color: pal.sub, fontSize: 13, padding: '24px 0' }}>No media in this filter.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {items.map((m) => (
            <div key={m.id} style={{ background: pal.panel, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
              {m.media_type === 'photo' && m.public_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.public_url} alt={m.caption ?? 'photo'} style={{ width: '100%', display: 'block', aspectRatio: '1', objectFit: 'cover' }} />
              )}
              {m.media_type === 'video' && m.public_url && (
                <video src={m.public_url} controls playsInline preload="metadata" style={{ width: '100%', display: 'block', aspectRatio: '1', objectFit: 'cover', background: '#000' }} />
              )}
              {m.media_type === 'audio' && (
                <div style={{ padding: 12 }}>
                  <div style={{ fontSize: 22, textAlign: 'center', marginBottom: 8 }}>🎙️</div>
                  {m.public_url && <audio src={m.public_url} controls style={{ width: '100%' }} />}
                </div>
              )}
              {(m.caption || m.guest_name) && (
                <div style={{ padding: '6px 8px' }}>
                  {m.caption && <p style={{ fontSize: 12, color: pal.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.caption}</p>}
                  {m.guest_name && <p style={{ fontSize: 10, color: pal.sub, margin: 0 }}>{m.guest_name}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Countdown({ ms, pal }: { ms: number; pal: ReturnType<typeof palette> }) {
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const cell = (v: number, label: string) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: pal.text }}>{String(v).padStart(2, '0')}</div>
      <div style={{ fontSize: 10, color: pal.sub, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
    </div>
  )
  return (
    <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
      {cell(d, 'days')}{cell(h, 'hrs')}{cell(m, 'min')}{cell(sec, 'sec')}
    </div>
  )
}

// ─── Shared UI atoms ────────────────────────────────────────────────────────
function Panel({ children, pal }: { children: React.ReactNode; pal: ReturnType<typeof palette> }) {
  return (
    <div style={{ background: pal.panel, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 22 }}>
      {children}
    </div>
  )
}
function ErrBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', borderRadius: 12, padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>
      {children}
    </div>
  )
}
function Input({ pal, label, value, onChange, type = 'text', placeholder, inputMode }: {
  pal: ReturnType<typeof palette>; label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; inputMode?: 'tel' | 'numeric' | 'text'
}) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ fontSize: 12, color: pal.sub }}>{label}</span>
      <input type={type} inputMode={inputMode} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', marginTop: 5, padding: '12px', borderRadius: 12,
          background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.14)', color: pal.text, fontSize: 16 }} />
    </label>
  )
}
function PrimaryBtn({ pal, busy, onClick, children }: {
  pal: ReturnType<typeof palette>; busy?: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} disabled={busy} style={{
      width: '100%', marginTop: 6, padding: '14px', borderRadius: 14, border: 'none',
      background: pal.accent, color: '#111', fontSize: 16, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
    }}>{busy ? 'Please wait…' : children}</button>
  )
}
function BigBtn({ pal, onClick, emoji, title, disabled }: {
  pal: ReturnType<typeof palette>; onClick: () => void; emoji: string; title: string; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '16px', borderRadius: 16,
      border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)',
      color: pal.text, fontSize: 15, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1, textAlign: 'left',
    }}>
      <span style={{ fontSize: 24 }}>{emoji}</span> {title}
    </button>
  )
}
