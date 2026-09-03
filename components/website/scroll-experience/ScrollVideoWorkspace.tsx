'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Film,
  LoaderCircle,
  Plus,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { defaultScrollExperienceContent } from '@/lib/website-scroll-experience/types'
import { getCinematicPreset } from '@/lib/website-cinematic/presets'

type PageOption = {
  id: string
  title: string | null
  slug: string
  status: string
}

type ExperienceVersion = {
  id: string
  status: string
  duration_seconds?: number | null
  desktop_bytes?: number | null
  mobile_bytes?: number | null
  processing_error_category?: string | null
}

type Experience = {
  id: string
  name: string
  status: string
  created_at: string
  website_scroll_experience_versions?: ExperienceVersion | ExperienceVersion[] | null
}

type Notice = { tone: 'success' | 'error' | 'info'; message: string }

const TERMINAL_STATUSES = new Set(['READY', 'FAILED', 'ARCHIVED'])
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

function versionFor(experience: Experience) {
  const relation = experience.website_scroll_experience_versions
  return Array.isArray(relation) ? relation[0] : relation
}

function statusLabel(status: string) {
  return (
    {
      UPLOADING: 'Waiting for upload',
      UPLOADED: 'Upload received',
      QUEUED: 'Queued for processing',
      INSPECTING: 'Inspecting MP4',
      PROCESSING_DESKTOP: 'Creating desktop video',
      PROCESSING_MOBILE: 'Creating mobile video',
      GENERATING_POSTER: 'Creating poster',
      READY: 'Ready to add',
      FAILED: 'Processing failed',
    }[status] ?? status
  )
}

function formatBytes(value?: number | null) {
  if (!value || value <= 0) return null
  return `${(value / 1024 / 1024).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`
}

function putSupabaseFile(
  url: string,
  file: File,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', url)
    request.setRequestHeader('x-upsert', 'false')
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    })
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve()
      else reject(new Error('The video could not be uploaded to private storage.'))
    })
    request.addEventListener('error', () =>
      reject(new Error('The video upload was interrupted. Please try again.'))
    )
    const body = new FormData()
    body.append('cacheControl', '3600')
    body.append('', file)
    request.send(body)
  })
}

export function ScrollVideoWorkspace({
  tenantId,
  pages,
  targetSection,
}: {
  tenantId: string
  pages: PageOption[]
  targetSection?: { id: string; pageId: string }
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [experiences, setExperiences] = useState<Experience[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedPageId, setSelectedPageId] = useState(targetSection?.pageId ?? pages[0]?.id ?? '')
  const [attachingId, setAttachingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const loadExperiences = useCallback(async () => {
    const response = await fetch(
      `/api/website-builder/scroll-experiences?tenant_id=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' }
    )
    const body = (await response.json()) as {
      experiences?: Experience[]
      error?: string
    }
    if (!response.ok) throw new Error(body.error || 'Could not load Scroll Experiences.')
    setExperiences(body.experiences ?? [])
  }, [tenantId])

  useEffect(() => {
    void loadExperiences()
      .catch((error) =>
        setNotice({
          tone: 'error',
          message: error instanceof Error ? error.message : 'Could not load Scroll Experiences.',
        })
      )
      .finally(() => setLoading(false))
  }, [loadExperiences])

  const hasActiveProcessing = useMemo(
    () => experiences.some((experience) => !TERMINAL_STATUSES.has(experience.status)),
    [experiences]
  )

  useEffect(() => {
    if (!hasActiveProcessing) return
    const interval = window.setInterval(() => {
      void loadExperiences().catch(() => undefined)
    }, 3_000)
    return () => window.clearInterval(interval)
  }, [hasActiveProcessing, loadExperiences])

  const upload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.mp4')) {
      setNotice({ tone: 'error', message: 'Choose an MP4 video.' })
      return
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      setNotice({ tone: 'error', message: 'The MP4 must be 10 MB or smaller.' })
      return
    }

    setUploading(true)
    setUploadProgress(0)
    setNotice({ tone: 'info', message: 'Creating a secure upload session.' })
    try {
      const storageFile = ['video/mp4', 'application/mp4'].includes(file.type)
        ? file
        : new File([file], file.name, { type: 'video/mp4', lastModified: file.lastModified })
      const start = await fetch('/api/website-builder/scroll-experiences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          name: file.name.replace(/\.mp4$/i, ''),
          fileName: file.name,
          contentType: file.type || 'video/mp4',
          bytes: file.size,
        }),
      })
      const session = (await start.json()) as {
        uploadUrl?: string
        experienceId?: string
        experienceVersionId?: string
        error?: string
      }
      if (
        !start.ok ||
        !session.uploadUrl ||
        !session.experienceId ||
        !session.experienceVersionId
      ) {
        throw new Error(session.error || 'Could not create the upload session.')
      }

      setNotice({ tone: 'info', message: 'Uploading directly to private Supabase Storage.' })
      await putSupabaseFile(session.uploadUrl, storageFile, setUploadProgress)

      const complete = await fetch(
        `/api/website-builder/scroll-experiences/${encodeURIComponent(session.experienceId)}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, experienceVersionId: session.experienceVersionId }),
        }
      )
      const result = (await complete.json()) as { error?: string }
      if (!complete.ok) throw new Error(result.error || 'Could not start video processing.')

      setUploadProgress(100)
      setNotice({
        tone: 'success',
        message: 'Upload complete. The worker is creating the desktop, mobile, and poster assets.',
      })
      await loadExperiences()
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The upload failed.',
      })
    } finally {
      setUploading(false)
    }
  }

  const attachToPage = async (experience: Experience) => {
    const version = versionFor(experience)
    if (!selectedPageId || !version || experience.status !== 'READY') return
    setAttachingId(experience.id)
    setNotice(null)
    try {
      const content = {
        ...defaultScrollExperienceContent(),
        cinematic: getCinematicPreset('Video Scroll'),
        experienceId: experience.id,
        experienceVersionId: version.id,
        status: 'READY',
        duration: Number(version.duration_seconds ?? 0) || undefined,
        desktopBytes: Number(version.desktop_bytes ?? 0) || undefined,
        mobileBytes: Number(version.mobile_bytes ?? 0) || undefined,
      }
      const response = await fetch(
        targetSection
          ? `/api/website/sections/${encodeURIComponent(targetSection.id)}`
          : '/api/website/sections',
        {
          method: targetSection ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            targetSection
              ? { content }
              : {
                  page_id: selectedPageId,
                  section_type: 'scroll_experience',
                  section_key: `scroll-${experience.id.slice(0, 8)}`,
                  sort_order: 10_000,
                  is_visible: true,
                  content,
                }
          ),
        }
      )
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not add the video to this page.')
      const page = pages.find((candidate) => candidate.id === selectedPageId)
      setNotice({
        tone: 'success',
        message: targetSection
          ? `Connected ${experience.name} to the selected Scroll Experience section.`
          : `Added ${experience.name} to ${page?.title || `/${page?.slug || ''}`}.`,
      })
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not add the video to this page.',
      })
    } finally {
      setAttachingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gold-400">
            <Film className="h-4 w-4" aria-hidden="true" />
            Interactive video
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Scroll Experience</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/45">
            Upload one MP4. Nexora prepares scrub-ready desktop and mobile videos plus a poster,
            then lets you add the experience to any business website page.
          </p>
        </div>
        <Link
          href="/website/pages"
          className="inline-flex min-h-10 items-center gap-2 self-start rounded-xl border border-white/10 px-4 text-sm font-medium text-white/60 transition hover:border-white/20 hover:text-white sm:self-auto"
        >
          Open Pages
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <section className="rounded-2xl border border-gold-500/25 bg-graphite-900/70 p-5 shadow-panel sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="group flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gold-500/35 bg-gold-500/[0.035] px-5 text-center transition hover:border-gold-400/60 hover:bg-gold-500/[0.06] focus-ring disabled:cursor-wait disabled:opacity-60"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-gold-500/25 bg-gold-500/10 text-gold-400">
              {uploading ? (
                <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
            </span>
            <span className="text-sm font-semibold text-white">
              {uploading ? 'Uploading MP4' : 'Choose MP4 video'}
            </span>
            <span className="max-w-md text-xs leading-relaxed text-white/40">
              Up to 10 MB. The source stays private in Supabase Storage and never passes through the
              browser app server.
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,.mp4"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
              event.currentTarget.value = ''
            }}
          />

          <div className="space-y-3 text-sm">
            <h2 className="font-semibold text-white">What happens next</h2>
            <ol className="space-y-2 text-xs leading-relaxed text-white/45">
              <li>1. The MP4 uploads directly to tenant-scoped private Supabase Storage.</li>
              <li>2. The worker validates and creates short-GOP desktop and mobile versions.</li>
              <li>3. Choose a page and add the ready Scroll Experience.</li>
            </ol>
          </div>
        </div>

        {uploading ? (
          <div className="mt-4" aria-live="polite">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-white/45">Secure upload</span>
              <span className="font-mono text-gold-400">{uploadProgress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-gold-400 transition-[width] duration-150 motion-reduce:transition-none"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : null}
      </section>

      {notice ? <NoticeBanner notice={notice} /> : null}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Video library</h2>
            <p className="mt-0.5 text-xs text-white/35">
              Processing updates automatically. Only Ready videos can be published.
            </p>
          </div>
          <label className="block min-w-56">
            <span className="mb-1.5 block text-xs font-medium text-white/45">
              Add ready video to
            </span>
            <select
              value={selectedPageId}
              onChange={(event) => setSelectedPageId(event.target.value)}
              disabled={Boolean(targetSection)}
              className="min-h-10 w-full rounded-xl border border-white/10 bg-graphite-900 px-3 text-sm text-white outline-none transition focus:border-gold-500/50 focus:ring-2 focus:ring-gold-500/15"
            >
              {pages.length === 0 ? <option value="">Create a page first</option> : null}
              {pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.title || `/${page.slug || ''}`}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map((item) => (
              <div
                key={item}
                className="h-32 animate-pulse rounded-2xl bg-white/[0.035] motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : experiences.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center">
            <Film className="mx-auto h-6 w-6 text-white/25" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-white/65">No Scroll Experiences yet</p>
            <p className="mt-1 text-xs text-white/35">Upload your first MP4 above.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {experiences.map((experience) => {
              const version = versionFor(experience)
              const ready = experience.status === 'READY' && Boolean(version)
              const failed = experience.status === 'FAILED'
              return (
                <article
                  key={experience.id}
                  className="flex min-h-36 flex-col rounded-2xl border border-white/[0.075] bg-graphite-900/65 p-4"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                        ready
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                          : failed
                            ? 'border-red-500/20 bg-red-500/10 text-red-400'
                            : 'border-gold-500/20 bg-gold-500/10 text-gold-400'
                      }`}
                    >
                      {ready ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : failed ? (
                        <CircleAlert className="h-4 w-4" />
                      ) : (
                        <Clock3 className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-white">
                        {experience.name}
                      </h3>
                      <p
                        className={`mt-0.5 text-xs ${
                          ready ? 'text-emerald-400' : failed ? 'text-red-400' : 'text-gold-400'
                        }`}
                      >
                        {statusLabel(experience.status)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-white/35">
                    {version?.duration_seconds ? (
                      <span>{Number(version.duration_seconds).toFixed(1)} seconds</span>
                    ) : null}
                    {formatBytes(version?.desktop_bytes) ? (
                      <span>Desktop {formatBytes(version?.desktop_bytes)}</span>
                    ) : null}
                    {formatBytes(version?.mobile_bytes) ? (
                      <span>Mobile {formatBytes(version?.mobile_bytes)}</span>
                    ) : null}
                    {failed && version?.processing_error_category ? (
                      <span>{version.processing_error_category.replaceAll('_', ' ')}</span>
                    ) : null}
                  </div>

                  <div className="mt-auto flex justify-end pt-4">
                    <Button
                      size="sm"
                      variant={ready ? 'primary' : 'secondary'}
                      disabled={!ready || !selectedPageId}
                      loading={attachingId === experience.id}
                      onClick={() => void attachToPage(experience)}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      {ready
                        ? targetSection
                          ? 'Use in section'
                          : 'Add to page'
                        : statusLabel(experience.status)}
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function NoticeBanner({ notice }: { notice: Notice }) {
  const Icon =
    notice.tone === 'success' ? CheckCircle2 : notice.tone === 'error' ? CircleAlert : Clock3
  return (
    <div
      role={notice.tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
        notice.tone === 'success'
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
          : notice.tone === 'error'
            ? 'border-red-500/20 bg-red-500/10 text-red-300'
            : 'border-gold-500/20 bg-gold-500/10 text-gold-300'
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{notice.message}</span>
    </div>
  )
}
