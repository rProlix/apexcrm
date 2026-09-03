'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Film, Plus, RotateCcw, Trash2, Upload } from 'lucide-react'
import { useBuilderStore } from '@/lib/builder/store'
import {
  normalizeScrollExperienceContent,
  type ScrollExperienceBeat,
  type ScrollExperienceContent,
} from '@/lib/website-scroll-experience/types'
import { Select, Textarea, Toggle, inputStyle } from './FormFields'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

type Experience = {
  id: string
  name: string
  status: string
  active_version_id: string | null
  website_scroll_experience_versions?: {
    id: string
    status: string
    duration_seconds?: number
    desktop_bytes?: number
    mobile_bytes?: number
    processing_error_category?: string | null
  } | null
}

const label: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: '#a1a1aa',
  fontSize: 12,
  fontWeight: 600,
}
const group: React.CSSProperties = { marginBottom: 16 }
const heading: React.CSSProperties = {
  margin: '22px 0 12px',
  color: '#c9a84c',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
}

export function ScrollExperienceEditor({ sectionId }: { sectionId: string }) {
  const { sections, updateSectionContent } = useBuilderStore()
  const section = sections.find((item) => item.id === sectionId)
  const content = normalizeScrollExperienceContent(section?.content)
  const [experiences, setExperiences] = useState<Experience[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tenantId = section?.tenant_id

  const patch = useCallback(
    (changes: Partial<ScrollExperienceContent>) => {
      if (!section) return
      updateSectionContent(sectionId, { ...section.content, ...changes })
    },
    [section, sectionId, updateSectionContent]
  )

  const load = useCallback(async () => {
    if (!tenantId) return
    const response = await fetch(
      `/api/website-builder/scroll-experiences?tenant_id=${encodeURIComponent(tenantId)}&page_id=${encodeURIComponent(section?.page_id ?? '')}`
    )
    const json = (await response.json()) as {
      ok?: boolean
      experiences?: Experience[]
      error?: string
    }
    if (!response.ok) throw new Error(json.error || 'Could not load Scroll Experiences.')
    setExperiences(json.experiences ?? [])
    const selected = json.experiences?.find((item) => item.id === content.experienceId)
    const version = selected?.website_scroll_experience_versions
    if (
      selected &&
      version &&
      (content.status !== selected.status ||
        content.duration !== Number(version.duration_seconds ?? 0))
    ) {
      patch({
        status: selected.status,
        experienceVersionId: version.id,
        duration: Number(version.duration_seconds ?? 0) || undefined,
        desktopBytes: Number(version.desktop_bytes ?? 0) || undefined,
        mobileBytes: Number(version.mobile_bytes ?? 0) || undefined,
      })
    }
  }, [content.duration, content.experienceId, content.status, patch, section?.page_id, tenantId])

  useEffect(() => {
    void load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Could not load videos.')
    )
  }, [load])
  useEffect(() => {
    if (!content.experienceId || content.status === 'READY' || content.status === 'FAILED') return
    const timer = setInterval(() => {
      void load().catch(() => undefined)
    }, 3_000)
    return () => clearInterval(timer)
  }, [content.experienceId, content.status, load])

  const selected = experiences.find((item) => item.id === content.experienceId)
  const status = selected?.status ?? content.status
  const processingLabel = useMemo(
    () =>
      ({
        UPLOADING: 'Uploading',
        UPLOADED: 'Upload received',
        QUEUED: 'Waiting for processor',
        INSPECTING: 'Analyzing video',
        PROCESSING_DESKTOP: 'Optimizing desktop',
        PROCESSING_MOBILE: 'Optimizing mobile',
        GENERATING_POSTER: 'Creating poster',
        READY: 'Ready',
        FAILED: 'Processing failed',
      })[String(status)] ?? 'No video selected',
    [status]
  )

  const upload = async (file: File) => {
    if (!tenantId || !section) return
    if (!file.name.toLowerCase().endsWith('.mp4') || file.size <= 0) {
      setError('Choose a valid MP4 video.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('The MP4 must be 10 MB or smaller.')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const storageFile = ['video/mp4', 'application/mp4'].includes(file.type)
        ? file
        : new File([file], file.name, { type: 'video/mp4', lastModified: file.lastModified })
      const start = await fetch('/api/website-builder/scroll-experiences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          pageId: section.page_id,
          componentInstanceId: section.id,
          name: file.name.replace(/\.mp4$/i, ''),
          fileName: file.name,
          contentType: file.type || 'video/mp4',
          bytes: file.size,
        }),
      })
      const session = (await start.json()) as {
        ok?: boolean
        error?: string
        uploadUrl?: string
        uploadToken?: string
        objectKey?: string
        storageBucket?: string
        experienceId?: string
        experienceVersionId?: string
      }
      if (
        !start.ok ||
        !session.uploadUrl ||
        !session.uploadToken ||
        !session.objectKey ||
        !session.storageBucket ||
        !session.experienceId ||
        !session.experienceVersionId
      )
        throw new Error(session.error || 'Could not start upload.')
      const { createClient } = await import('@/lib/supabase/browser')
      const supabase = createClient()
      const { error: directError } = await supabase.storage
        .from(session.storageBucket)
        .uploadToSignedUrl(session.objectKey, session.uploadToken, storageFile, {
          contentType: 'video/mp4',
        })
      if (directError) throw new Error('The direct video upload failed. Please try again.')
      const complete = await fetch(
        `/api/website-builder/scroll-experiences/${encodeURIComponent(session.experienceId)}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, experienceVersionId: session.experienceVersionId }),
        }
      )
      const result = (await complete.json()) as { ok?: boolean; error?: string; status?: string }
      if (!complete.ok) throw new Error(result.error || 'Could not start processing.')
      patch({
        experienceId: session.experienceId,
        experienceVersionId: session.experienceVersionId,
        status: result.status || 'QUEUED',
        previewInteraction: true,
      })
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const choose = (experienceId: string) => {
    const item = experiences.find((candidate) => candidate.id === experienceId)
    const version = item?.website_scroll_experience_versions
    if (!item || !version || item.status !== 'READY') return
    patch({
      experienceId: item.id,
      experienceVersionId: version.id,
      status: item.status,
      duration: Number(version.duration_seconds ?? 0) || undefined,
      desktopBytes: Number(version.desktop_bytes ?? 0) || undefined,
      mobileBytes: Number(version.mobile_bytes ?? 0) || undefined,
      previewInteraction: true,
    })
  }

  const retry = async () => {
    if (!tenantId || !content.experienceId) return
    setError(null)
    const response = await fetch(
      `/api/website-builder/scroll-experiences/${encodeURIComponent(content.experienceId)}/retry`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      }
    )
    const json = (await response.json()) as { error?: string; status?: string }
    if (!response.ok) return setError(json.error || 'Retry failed.')
    patch({ status: json.status || 'QUEUED' })
    await load()
  }

  const patchBeat = (index: number, changes: Partial<ScrollExperienceBeat>) => {
    patch({
      beats: content.beats.map((beat, beatIndex) =>
        beatIndex === index ? { ...beat, ...changes } : beat
      ),
    })
  }

  if (!section) return null
  return (
    <div>
      <h4 style={heading}>Media</h4>
      <label
        style={{
          display: 'grid',
          placeItems: 'center',
          gap: 8,
          minHeight: 116,
          padding: 18,
          border: '1px dashed #52525b',
          borderRadius: 14,
          background: '#171719',
          color: '#d4d4d8',
          cursor: uploading ? 'wait' : 'pointer',
        }}
      >
        <Upload size={20} aria-hidden="true" />
        <span style={{ fontSize: 13, fontWeight: 700 }}>
          {uploading ? 'Uploading video' : 'Upload MP4'}
        </span>
        <span style={{ color: '#71717a', fontSize: 11 }}>
          MP4 only, up to 10 MB. Stored privately in Supabase Storage.
        </span>
        <input
          disabled={uploading}
          type="file"
          accept="video/mp4,.mp4"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
            event.currentTarget.value = ''
          }}
        />
      </label>
      <div style={{ ...group, marginTop: 14 }}>
        <label style={label}>Choose ready video</label>
        <Select
          value={content.experienceId ?? ''}
          onChange={choose}
          options={[
            { value: '', label: 'Choose from media library' },
            ...experiences
              .filter((item) => item.status === 'READY')
              .map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
      </div>
      <div
        aria-live="polite"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 12,
          borderRadius: 12,
          border: `1px solid ${status === 'FAILED' ? '#7f1d1d' : status === 'READY' ? '#365314' : '#3f3f46'}`,
          background: status === 'FAILED' ? '#2a1010' : '#151517',
          color: status === 'FAILED' ? '#fca5a5' : '#d4d4d8',
          fontSize: 12,
        }}
      >
        <Film size={16} aria-hidden="true" />
        <span style={{ flex: 1 }}>{processingLabel}</span>
        {status === 'FAILED' ? (
          <button
            type="button"
            onClick={() => void retry()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              border: 0,
              background: 'transparent',
              color: '#fca5a5',
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={14} />
            Retry
          </button>
        ) : null}
      </div>
      {error ? (
        <p
          role="alert"
          style={{ margin: '10px 0 0', color: '#fca5a5', fontSize: 12, lineHeight: 1.45 }}
        >
          {error}
        </p>
      ) : null}

      <h4 style={heading}>Playback</h4>
      <Range
        label="Start time"
        value={content.startTime}
        min={0}
        max={Math.max(1, content.duration ?? 60)}
        step={0.1}
        suffix="s"
        onChange={(value) => patch({ startTime: value })}
      />
      <Range
        label="End time"
        value={content.endTime ?? content.duration ?? 60}
        min={Math.min(content.startTime + 0.1, content.duration ?? 60)}
        max={Math.max(1, content.duration ?? 60)}
        step={0.1}
        suffix="s"
        onChange={(value) => patch({ endTime: value })}
      />
      <Range
        label="Scroll length"
        value={content.scrollDistanceVh}
        min={150}
        max={900}
        step={25}
        suffix="vh"
        onChange={(value) => patch({ scrollDistanceVh: value })}
      />
      <div style={group}>
        <label style={label}>Smoothing</label>
        <Select
          value={content.smoothing}
          onChange={(value) => patch({ smoothing: value as ScrollExperienceContent['smoothing'] })}
          options={[
            { value: 'direct', label: 'Direct' },
            { value: 'smooth', label: 'Smooth' },
            { value: 'cinematic', label: 'Cinematic' },
          ]}
        />
      </div>
      <div style={group}>
        <label style={label}>Direction</label>
        <Select
          value={content.direction}
          onChange={(value) => patch({ direction: value as ScrollExperienceContent['direction'] })}
          options={[
            { value: 'forward', label: 'Forward' },
            { value: 'reverse', label: 'Reverse' },
          ]}
        />
      </div>
      <Toggle
        label="Enable live scroll preview"
        value={content.previewInteraction === true}
        onChange={(value) => patch({ previewInteraction: value })}
      />
      <p style={{ margin: '-8px 0 16px', color: '#71717a', fontSize: 11, lineHeight: 1.5 }}>
        Visitor scrolling scrubs the MP4 timeline. For a 3D fly-through, the camera movement must
        already be rendered into the uploaded video.
      </p>

      <h4 style={heading}>Layout and overlay</h4>
      <div style={group}>
        <label style={label}>Video fit</label>
        <Select
          value={content.fit}
          onChange={(value) => patch({ fit: value as ScrollExperienceContent['fit'] })}
          options={[
            { value: 'cover', label: 'Cover' },
            { value: 'contain', label: 'Contain' },
          ]}
        />
      </div>
      <div style={group}>
        <label style={label}>Mobile crop</label>
        <Select
          value={content.mobileFit}
          onChange={(value) => patch({ mobileFit: value as ScrollExperienceContent['mobileFit'] })}
          options={[
            { value: 'cover', label: 'Cover' },
            { value: 'contain', label: 'Contain' },
            { value: 'center_crop', label: 'Center crop' },
          ]}
        />
      </div>
      <Range
        label="Overlay opacity"
        value={content.overlayOpacity}
        min={0}
        max={0.9}
        step={0.05}
        onChange={(value) => patch({ overlayOpacity: value })}
      />
      <div style={group}>
        <label style={label}>Reduced motion</label>
        <Select
          value={content.reducedMotionMode}
          onChange={(value) =>
            patch({ reducedMotionMode: value as ScrollExperienceContent['reducedMotionMode'] })
          }
          options={[
            { value: 'poster', label: 'Poster only' },
            { value: 'fade', label: 'Simple fade' },
            { value: 'none', label: 'No motion' },
          ]}
        />
      </div>

      <h4 style={heading}>Content</h4>
      <div style={group}>
        <label style={label}>Heading</label>
        <input
          style={inputStyle}
          value={content.heading ?? ''}
          onChange={(event) => patch({ heading: event.target.value })}
        />
      </div>
      <div style={group}>
        <label style={label}>Body</label>
        <Textarea
          rows={3}
          value={content.body ?? ''}
          onChange={(value) => patch({ body: value })}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, ...group }}>
        <div>
          <label style={label}>Button label</label>
          <input
            style={inputStyle}
            value={content.buttonLabel ?? ''}
            onChange={(event) => patch({ buttonLabel: event.target.value })}
          />
        </div>
        <div>
          <label style={label}>Button link</label>
          <input
            style={inputStyle}
            value={content.buttonHref ?? ''}
            onChange={(event) => patch({ buttonHref: event.target.value })}
          />
        </div>
      </div>

      <h4 style={heading}>Story beats</h4>
      {content.beats.map((beat, index) => (
        <div
          key={beat.id}
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 12,
            border: '1px solid #303034',
            background: '#151517',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <strong style={{ flex: 1, color: '#d4d4d8', fontSize: 12 }}>Beat {index + 1}</strong>
            <button
              type="button"
              aria-label={`Remove beat ${index + 1}`}
              onClick={() =>
                patch({ beats: content.beats.filter((_, itemIndex) => itemIndex !== index) })
              }
              style={{ border: 0, background: 'transparent', color: '#a1a1aa', cursor: 'pointer' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
          <input
            style={{ ...inputStyle, marginBottom: 8 }}
            placeholder="Title"
            value={beat.title ?? ''}
            onChange={(event) => patchBeat(index, { title: event.target.value })}
          />
          <Textarea
            rows={2}
            value={beat.body ?? ''}
            onChange={(value) => patchBeat(index, { body: value })}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <Range
              label="Starts"
              value={beat.startProgress}
              min={0}
              max={1}
              step={0.05}
              onChange={(value) => patchBeat(index, { startProgress: value })}
            />
            <Range
              label="Ends"
              value={beat.endProgress}
              min={0}
              max={1}
              step={0.05}
              onChange={(value) => patchBeat(index, { endProgress: value })}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          patch({
            beats: [
              ...content.beats,
              {
                id: crypto.randomUUID(),
                startProgress: Math.min(0.9, content.beats.length * 0.25),
                endProgress: Math.min(1, (content.beats.length + 1) * 0.25),
                title: 'New story beat',
                body: '',
              },
            ],
          })
        }
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          width: '100%',
          padding: 10,
          border: '1px solid #3f3f46',
          borderRadius: 10,
          background: '#1c1c1f',
          color: '#e4e4e7',
          cursor: 'pointer',
          fontWeight: 700,
        }}
      >
        <Plus size={15} />
        Add story beat
      </button>
      <div style={{ marginTop: 16 }}>
        <Toggle
          label="Show progress navigation"
          value={content.showProgressNavigation}
          onChange={(value) => patch({ showProgressNavigation: value })}
        />
      </div>
    </div>
  )
}

function Range({
  label: title,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <div style={group}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <label style={label}>{title}</label>
        <span style={{ color: '#71717a', fontSize: 11 }}>
          {Number(value.toFixed(2))}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ width: '100%', accentColor: '#c9a84c' }}
      />
    </div>
  )
}
