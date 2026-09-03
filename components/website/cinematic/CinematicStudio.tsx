'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Layers3,
  Plus,
  Redo2,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react'
import { CinematicRenderer } from './CinematicRenderer'
import {
  cinematicConfigSchema,
  normalizeCinematicConfig,
  type CinematicConfig,
  type CinematicLayer,
  type CinematicTrack,
} from '@/lib/website-cinematic/schema'
import { CINEMATIC_PRESETS } from '@/lib/website-cinematic/presets'

type SaveState = 'saved' | 'saving' | 'error'
const field =
  'w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#c9a84c]/70'

export function CinematicStudio({
  sectionId,
  initialContent,
}: {
  sectionId: string
  initialContent: Record<string, unknown>
}) {
  const initial = normalizeCinematicConfig(initialContent.cinematic) ?? CINEMATIC_PRESETS[0]
  const [config, setConfig] = useState<CinematicConfig>(initial)
  const [selectedLayerId, setSelectedLayerId] = useState(initial.layers[0]?.id ?? '')
  const [previewProgress, setPreviewProgress] = useState(0)
  const [manualPreview, setManualPreview] = useState(true)
  const [breakpoint, setBreakpoint] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const history = useRef<CinematicConfig[]>([])
  const future = useRef<CinematicConfig[]>([])
  const first = useRef(true)

  const commit = useCallback(
    (next: CinematicConfig | ((current: CinematicConfig) => CinematicConfig)) => {
      setConfig((current) => {
        history.current = [...history.current.slice(-39), current]
        future.current = []
        return typeof next === 'function' ? next(current) : next
      })
    },
    []
  )

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setSaveState('saving')
    const timer = window.setTimeout(async () => {
      const parsed = cinematicConfigSchema.safeParse(config)
      if (!parsed.success) return setSaveState('error')
      try {
        const response = await fetch(`/api/website/sections/${encodeURIComponent(sectionId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: { ...initialContent, cinematic: parsed.data } }),
        })
        setSaveState(response.ok ? 'saved' : 'error')
      } catch {
        setSaveState('error')
      }
    }, 900)
    return () => window.clearTimeout(timer)
  }, [config, initialContent, sectionId])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saveState === 'saved') return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saveState])

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      event.preventDefault()
      event.shiftKey ? redo() : undo()
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  })

  const undo = () => {
    const previous = history.current.pop()
    if (!previous) return
    future.current.push(config)
    setConfig(previous)
  }
  const redo = () => {
    const next = future.current.pop()
    if (!next) return
    history.current.push(config)
    setConfig(next)
  }
  const selected = config.layers.find((layer) => layer.id === selectedLayerId)
  const selectedTrack = config.tracks.find((track) => track.layerId === selectedLayerId)
  const patchLayer = (changes: Partial<CinematicLayer>) =>
    commit((current) => ({
      ...current,
      layers: current.layers.map((layer) =>
        layer.id === selectedLayerId ? { ...layer, ...changes } : layer
      ),
    }))
  const patchTrack = (changes: Partial<CinematicTrack>) =>
    commit((current) => ({
      ...current,
      tracks: current.tracks.map((track) =>
        track.id === selectedTrack?.id ? { ...track, ...changes } : track
      ),
    }))
  const addLayer = () => {
    const id = crypto.randomUUID()
    commit((current) => ({
      ...current,
      layers: [
        ...current.layers,
        {
          id,
          sceneId: current.scenes[0]?.id || 'main',
          type: 'heading',
          name: 'New headline',
          content: 'New cinematic moment',
          alt: '',
          decorative: false,
          locked: false,
          hidden: false,
          x: 50,
          y: 50,
          width: 46,
          zIndex: current.layers.length + 2,
          color: '#ffffff',
          fontSize: 64,
          textAlign: 'left',
          fit: 'contain',
          visibleOn: ['desktop', 'tablet', 'mobile'],
          baseTransform: {},
        },
      ],
    }))
    setSelectedLayerId(id)
  }
  const duplicateLayer = () => {
    if (!selected) return
    const id = crypto.randomUUID()
    commit((current) => ({
      ...current,
      layers: [
        ...current.layers,
        { ...selected, id, name: `${selected.name} copy`, x: selected.x + 3, y: selected.y + 3 },
      ],
      tracks: [
        ...current.tracks,
        ...current.tracks
          .filter((track) => track.layerId === selected.id)
          .map((track) => ({ ...track, id: crypto.randomUUID(), layerId: id })),
      ],
    }))
    setSelectedLayerId(id)
  }
  const removeLayer = () => {
    if (!selected) return
    commit((current) => ({
      ...current,
      layers: current.layers.filter((layer) => layer.id !== selected.id),
      tracks: current.tracks.filter((track) => track.layerId !== selected.id),
    }))
    setSelectedLayerId('')
  }
  const addTrack = () => {
    if (!selected) return
    commit((current) => ({
      ...current,
      tracks: [
        ...current.tracks,
        {
          id: crypto.randomUUID(),
          layerId: selected.id,
          name: 'Reveal',
          startProgress: 0.1,
          endProgress: 0.5,
          from: { opacity: 0, y: 60, scale: 0.94 },
          to: { opacity: 1, y: 0, scale: 1 },
          easing: 'power2',
          enabled: true,
        },
      ],
    }))
  }
  const viewportWidth = breakpoint === 'desktop' ? '100%' : breakpoint === 'tablet' ? 760 : 390
  const sceneName =
    config.scenes.find(
      (scene) => previewProgress >= scene.startProgress && previewProgress <= scene.endProgress
    )?.name ?? 'Story'

  return (
    <main className="min-h-[calc(100dvh-5rem)] bg-[#09090b] text-zinc-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="mr-auto">
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#c9a84c]">
            Cinematic Scroll
          </p>
          <input
            className="mt-1 bg-transparent text-lg font-semibold outline-none"
            value={config.name}
            onChange={(event) => commit({ ...config, name: event.target.value })}
          />
        </div>
        <div className="flex rounded-lg border border-white/10 bg-white/[.03] p-1">
          {(['desktop', 'tablet', 'mobile'] as const).map((item) => (
            <button
              key={item}
              onClick={() => setBreakpoint(item)}
              className={`rounded-md px-3 py-1.5 text-xs capitalize ${breakpoint === item ? 'bg-white/10 text-white' : 'text-zinc-500'}`}
            >
              {item}
            </button>
          ))}
        </div>
        <button
          onClick={undo}
          aria-label="Undo"
          className="rounded-lg p-2 text-zinc-400 hover:bg-white/10"
        >
          <Undo2 size={17} />
        </button>
        <button
          onClick={redo}
          aria-label="Redo"
          className="rounded-lg p-2 text-zinc-400 hover:bg-white/10"
        >
          <Redo2 size={17} />
        </button>
        <span
          className={`flex items-center gap-1.5 text-xs ${saveState === 'error' ? 'text-red-400' : 'text-zinc-500'}`}
        >
          <Save size={14} />
          {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Saved'}
        </span>
      </header>
      <div className="grid min-h-[680px] grid-cols-1 xl:grid-cols-[240px_minmax(0,1fr)_280px]">
        <aside className="border-r border-white/10 bg-[#0d0d10] p-3">
          <div className="mb-5">
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.16em] text-zinc-500">
              Build mode
            </label>
            <select
              className={field}
              value={config.engine}
              onChange={(event) => {
                const engine = event.target.value as CinematicConfig['engine']
                commit({
                  ...config,
                  engine,
                  video:
                    engine === 'layers'
                      ? null
                      : (config.video ?? {
                          clips: [],
                          fit: 'cover',
                          focalPoint: { x: 50, y: 50 },
                        }),
                })
              }}
            >
              <option value="layers">Layer Animation</option>
              <option value="video">Video Scroll</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div className="mb-5">
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.16em] text-zinc-500">
              Preset
            </label>
            <select
              className={field}
              value=""
              onChange={(event) => {
                const preset = CINEMATIC_PRESETS[Number(event.target.value)]
                if (preset) {
                  commit(structuredClone(preset))
                  setSelectedLayerId(preset.layers[0]?.id || '')
                }
              }}
            >
              <option value="">Choose a starting point</option>
              {CINEMATIC_PRESETS.map((preset, index) => (
                <option key={preset.name} value={index}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-3 flex items-center">
            <h2 className="flex flex-1 items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-zinc-400">
              <Layers3 size={14} />
              Layers
            </h2>
            <button
              onClick={addLayer}
              aria-label="Add layer"
              className="rounded-md bg-[#c9a84c] p-1.5 text-black"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-1">
            {config.layers.map((layer, index) => (
              <button
                key={layer.id}
                onClick={() => setSelectedLayerId(layer.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${selectedLayerId === layer.id ? 'bg-[#c9a84c]/15 text-[#e4ca7d]' : 'text-zinc-400 hover:bg-white/[.04]'}`}
              >
                <span className="w-4 text-[10px] text-zinc-600">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{layer.name}</span>
                {layer.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            ))}
          </div>
          <div className="mb-2 mt-6 flex items-center">
            <h2 className="flex-1 text-[10px] font-bold uppercase tracking-[.16em] text-zinc-500">
              Scenes
            </h2>
            <button
              aria-label="Add scene"
              onClick={() =>
                commit((current) => {
                  const start = current.scenes.at(-1)?.endProgress ?? 0
                  return {
                    ...current,
                    scenes: [
                      ...current.scenes,
                      {
                        id: crypto.randomUUID(),
                        name: `Scene ${current.scenes.length + 1}`,
                        startProgress: Math.min(0.9, start),
                        endProgress: 1,
                        background: current.section.background,
                        transition: 'crossfade',
                      },
                    ],
                  }
                })
              }
              className="rounded-md border border-white/10 p-1"
            >
              <Plus size={12} />
            </button>
          </div>
          <div className="space-y-1">
            {config.scenes.map((scene) => (
              <div
                key={scene.id}
                className="rounded-md bg-white/[.03] px-2 py-1.5 text-[11px] text-zinc-400"
              >
                <span>{scene.name}</span>
                <span className="float-right text-zinc-600">
                  {Math.round(scene.startProgress * 100)}–{Math.round(scene.endProgress * 100)}%
                </span>
              </div>
            ))}
          </div>
        </aside>
        <section className="min-w-0 bg-[radial-gradient(circle_at_50%_20%,#242429_0,#111114_55%,#09090b_100%)] p-4">
          <div
            className="mx-auto overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl"
            style={{
              width: viewportWidth,
              maxWidth: '100%',
              aspectRatio: breakpoint === 'mobile' ? '390/700' : '16/9',
            }}
          >
            <div className="origin-top-left" style={{ width: '100%', height: '100%' }}>
              <CinematicRenderer
                config={config}
                manualProgress={manualPreview ? previewProgress : undefined}
                editorMode
                previewBreakpoint={breakpoint}
                selectedLayerId={selectedLayerId}
                onSelectLayer={setSelectedLayerId}
                onLayerDragStart={() => {
                  history.current = [...history.current.slice(-39), config]
                  future.current = []
                }}
                onMoveLayer={(layerId, x, y) =>
                  setConfig((current) => ({
                    ...current,
                    layers: current.layers.map((layer) =>
                      layer.id === layerId ? { ...layer, x, y } : layer
                    ),
                  }))
                }
              />
            </div>
          </div>
        </section>
        <aside className="border-l border-white/10 bg-[#0d0d10] p-4">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[.14em] text-zinc-400">
            Properties
          </h2>
          {config.engine !== 'layers' && config.video ? (
            <div className="mb-5 space-y-2 border-b border-white/10 pb-5">
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-zinc-500">
                Video chain
              </p>
              {config.video.clips.map((clip, index) => (
                <div key={clip.id} className="rounded-lg bg-white/[.03] p-2">
                  <div className="mb-2 flex items-center text-[10px] text-zinc-500">
                    <span className="flex-1">Clip {index + 1}</span>
                    <button
                      aria-label={`Delete clip ${index + 1}`}
                      onClick={() =>
                        commit({
                          ...config,
                          video: {
                            ...config.video!,
                            clips: config.video!.clips.filter((item) => item.id !== clip.id),
                          },
                        })
                      }
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <input
                    className={field}
                    placeholder="Desktop MP4 URL"
                    value={clip.desktopSrc}
                    onChange={(event) =>
                      commit({
                        ...config,
                        video: {
                          ...config.video!,
                          clips: config.video!.clips.map((item) =>
                            item.id === clip.id ? { ...item, desktopSrc: event.target.value } : item
                          ),
                        },
                      })
                    }
                  />
                  <input
                    className={`${field} mt-2`}
                    placeholder="Optional mobile MP4 URL"
                    value={clip.mobileSrc || ''}
                    onChange={(event) =>
                      commit({
                        ...config,
                        video: {
                          ...config.video!,
                          clips: config.video!.clips.map((item) =>
                            item.id === clip.id
                              ? { ...item, mobileSrc: event.target.value || undefined }
                              : item
                          ),
                        },
                      })
                    }
                  />
                </div>
              ))}
              <button
                onClick={() =>
                  commit({
                    ...config,
                    video: {
                      ...config.video!,
                      clips: [
                        ...config.video!.clips,
                        {
                          id: crypto.randomUUID(),
                          desktopSrc: '/media/video.mp4',
                          duration: 10,
                          scrollWeight: 1,
                          seamOverlap: 0.015,
                        },
                      ],
                    },
                  })
                }
                className="w-full rounded-lg border border-dashed border-white/15 py-2 text-xs text-zinc-400"
              >
                Add clip
              </button>
              <p className="text-[10px] leading-relaxed text-zinc-600">
                Use the Media Library for securely processed uploads. Advanced chains accept
                published storage/CDN URLs.
              </p>
            </div>
          ) : null}
          {selected ? (
            <div className="space-y-3">
              <input
                className={field}
                value={selected.name}
                onChange={(event) => patchLayer({ name: event.target.value })}
              />
              <select
                className={field}
                value={selected.type}
                onChange={(event) =>
                  patchLayer({ type: event.target.value as CinematicLayer['type'] })
                }
              >
                {['heading', 'paragraph', 'button', 'image', 'svg', 'shape', 'group'].map(
                  (type) => (
                    <option key={type}>{type}</option>
                  )
                )}
              </select>
              {['heading', 'paragraph', 'button', 'group'].includes(selected.type) ? (
                <textarea
                  className={field}
                  rows={3}
                  value={selected.content}
                  onChange={(event) => patchLayer({ content: event.target.value })}
                />
              ) : null}
              {['image', 'svg'].includes(selected.type) ? (
                <input
                  className={field}
                  placeholder="Asset URL"
                  value={selected.src || ''}
                  onChange={(event) => patchLayer({ src: event.target.value })}
                />
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="X %" value={selected.x} onChange={(x) => patchLayer({ x })} />
                <NumberField label="Y %" value={selected.y} onChange={(y) => patchLayer({ y })} />
                <NumberField
                  label="Width %"
                  value={selected.width}
                  onChange={(width) => patchLayer({ width })}
                />
                <NumberField
                  label="Type px"
                  value={selected.fontSize}
                  onChange={(fontSize) => patchLayer({ fontSize })}
                />
              </div>
              <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
                Color
                <input
                  className={`${field} mt-1 h-10`}
                  type="color"
                  value={selected.color.startsWith('#') ? selected.color : '#ffffff'}
                  onChange={(event) => patchLayer({ color: event.target.value })}
                />
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => patchLayer({ hidden: !selected.hidden })}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 py-2 text-xs"
                >
                  <EyeOff size={14} />
                  Hide
                </button>
                <button
                  onClick={duplicateLayer}
                  className="rounded-lg border border-white/10 p-2"
                  aria-label="Duplicate layer"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={removeLayer}
                  className="rounded-lg border border-red-500/20 p-2 text-red-400"
                  aria-label="Delete layer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {selectedTrack ? (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-[.14em] text-zinc-500">
                    Animation
                  </p>
                  <NumberField
                    label="Start (0–1)"
                    value={selectedTrack.startProgress}
                    step={0.01}
                    onChange={(startProgress) =>
                      patchTrack({
                        startProgress: Math.min(startProgress, selectedTrack.endProgress),
                      })
                    }
                  />
                  <NumberField
                    label="End (0–1)"
                    value={selectedTrack.endProgress}
                    step={0.01}
                    onChange={(endProgress) =>
                      patchTrack({
                        endProgress: Math.max(endProgress, selectedTrack.startProgress),
                      })
                    }
                  />
                </div>
              ) : (
                <button
                  onClick={addTrack}
                  className="w-full rounded-lg border border-dashed border-white/15 py-2 text-xs text-zinc-400"
                >
                  Add animation track
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-600">Select a layer to edit it.</p>
          )}
        </aside>
      </div>
      <footer className="border-t border-white/10 bg-[#0b0b0d] px-4 py-3">
        <div className="mb-2 flex items-center gap-3">
          <button
            onClick={() => setManualPreview(!manualPreview)}
            className={`rounded-md px-2.5 py-1 text-xs ${manualPreview ? 'bg-[#c9a84c] text-black' : 'bg-white/10 text-zinc-300'}`}
          >
            {manualPreview ? 'Manual scrub' : 'Scroll preview'}
          </button>
          <span className="text-xs text-zinc-500">
            {Math.round(previewProgress * 100)}% · {sceneName}
          </span>
          <div className="ml-auto flex items-center gap-1 text-zinc-600">
            <ChevronUp size={13} />
            <ChevronDown size={13} />
          </div>
        </div>
        <input
          aria-label="Preview progress"
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={previewProgress}
          onChange={(event) => setPreviewProgress(Number(event.target.value))}
          className="w-full accent-[#c9a84c]"
        />
        <div className="relative mt-2 h-7 overflow-hidden rounded-md bg-white/[.03]">
          {config.tracks.map((track) => (
            <button
              key={track.id}
              aria-label={`Select ${track.name}`}
              onClick={() => setSelectedLayerId(track.layerId)}
              className="absolute top-1 h-5 rounded-sm bg-[#c9a84c]/45 hover:bg-[#c9a84c]/70"
              style={{
                left: `${track.startProgress * 100}%`,
                width: `${Math.max(1, (track.endProgress - track.startProgress) * 100)}%`,
              }}
            />
          ))}
          <span
            className="absolute bottom-0 top-0 w-px bg-white/70"
            style={{ left: `${previewProgress * 100}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[9px] font-bold tracking-wider text-zinc-700">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>
      </footer>
    </main>
  )
}

function NumberField({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
      {label}
      <input
        className={`${field} mt-1`}
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}
