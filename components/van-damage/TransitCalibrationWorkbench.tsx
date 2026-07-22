'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import {
  DEFAULT_TRANSIT_CONFIGURATION,
  TRANSIT_VIEW_LABELS,
  TRANSIT_VIEW_ORDER,
  getTransitViewRegions,
  type TransitBodyLength,
  type TransitMapConfiguration,
  type TransitRearWheels,
  type TransitRoofHeight,
  type TransitView,
  type TransitWheelbaseInches,
} from '@/lib/van-damage/transit-blueprint'
import { createTransitGeometry } from '@/lib/van-damage/transit-geometry'
import { TransitBlueprintOutline } from './FordTransit2019DamageMap'

export function TransitCalibrationWorkbench() {
  const [view, setView] = useState<TransitView>('passenger')
  const [configuration, setConfiguration] = useState(DEFAULT_TRANSIT_CONFIGURATION)
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)
  const [referenceOpacity, setReferenceOpacity] = useState(55)
  const [showReference, setShowReference] = useState(true)
  const [outlineOnly, setOutlineOnly] = useState(false)
  const [showLandmarks, setShowLandmarks] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  const patternId = `calibration-grid-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const geometry = useMemo(() => createTransitGeometry(configuration), [configuration])
  const regions = useMemo(() => getTransitViewRegions(configuration)[view], [configuration, view])

  useEffect(
    () => () => {
      if (referenceUrl) URL.revokeObjectURL(referenceUrl)
    },
    [referenceUrl]
  )

  function update<K extends keyof TransitMapConfiguration>(
    key: K,
    value: TransitMapConfiguration[K]
  ) {
    setConfiguration((current) => ({
      ...current,
      [key]: value,
      ...(key === 'wheelbaseInches' && value === 130 ? { bodyLength: 'regular' } : {}),
    }))
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-5 p-5 text-white md:p-8">
      <div>
        <p className="text-xs uppercase tracking-[.18em] text-gold-300/65">Development only</p>
        <h1 className="mt-1 text-2xl font-semibold">2019 Transit precision calibration</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/45">
          Load a licensed reference from your computer. The file remains in this browser session; it
          is never uploaded, bundled, or stored by the application.
        </p>
      </div>

      <div className="grid gap-4 rounded-2xl border border-white/10 bg-graphite-800 p-4 lg:grid-cols-4">
        <Control label="View">
          <select
            value={view}
            onChange={(event) => setView(event.target.value as TransitView)}
            className={inputClass}
          >
            {TRANSIT_VIEW_ORDER.map((option) => (
              <option key={option} value={option}>
                {TRANSIT_VIEW_LABELS[option]}
              </option>
            ))}
          </select>
        </Control>
        <Control label="Wheelbase">
          <select
            value={configuration.wheelbaseInches}
            onChange={(event) =>
              update('wheelbaseInches', Number(event.target.value) as TransitWheelbaseInches)
            }
            className={inputClass}
          >
            <option value="130">130 in</option>
            <option value="148">148 in</option>
          </select>
        </Control>
        <Control label="Body length">
          <select
            value={configuration.bodyLength}
            disabled={configuration.wheelbaseInches === 130}
            onChange={(event) => update('bodyLength', event.target.value as TransitBodyLength)}
            className={`${inputClass} disabled:opacity-40`}
          >
            <option value="regular">Regular</option>
            <option value="extended">Extended</option>
          </select>
        </Control>
        <Control label="Roof">
          <select
            value={configuration.roofHeight}
            onChange={(event) => update('roofHeight', event.target.value as TransitRoofHeight)}
            className={inputClass}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Control>
        <Control label="Rear wheels">
          <select
            value={configuration.rearWheels}
            onChange={(event) => update('rearWheels', event.target.value as TransitRearWheels)}
            className={inputClass}
          >
            <option value="single">Single (SRW)</option>
            <option value="dual">Dual (DRW)</option>
          </select>
        </Control>
        <Control label="Body configuration">
          <select
            value={configuration.cargoConfiguration}
            onChange={(event) =>
              update('cargoConfiguration', event.target.value as 'cargo' | 'passenger')
            }
            className={inputClass}
          >
            <option value="cargo">Cargo / windowless side</option>
            <option value="passenger">Passenger / side glass</option>
          </select>
        </Control>
        <Control label="Local reference image">
          <input
            type="file"
            accept="image/*"
            className="block w-full text-xs text-white/55 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white"
            onChange={(event) => {
              if (referenceUrl) URL.revokeObjectURL(referenceUrl)
              const file = event.target.files?.[0]
              setReferenceUrl(file ? URL.createObjectURL(file) : null)
            }}
          />
        </Control>
        <Control label={`Reference opacity · ${referenceOpacity}%`}>
          <input
            type="range"
            min="0"
            max="100"
            value={referenceOpacity}
            onChange={(event) => setReferenceOpacity(Number(event.target.value))}
            className="w-full"
          />
        </Control>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2 lg:col-span-2">
          <Toggle label="Reference" checked={showReference} setChecked={setShowReference} />
          <Toggle label="Outline only" checked={outlineOnly} setChecked={setOutlineOnly} />
          <Toggle label="Landmarks" checked={showLandmarks} setChecked={setShowLandmarks} />
          <Toggle label="Grid" checked={showGrid} setChecked={setShowGrid} />
          <Toggle
            label="Rear-door glass"
            checked={configuration.rearDoorWindows}
            setChecked={(checked) => update('rearDoorWindows', checked)}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        <div className="relative aspect-[2/1] w-full">
          {referenceUrl && showReference && (
            // A local blob URL is deliberately used for a temporary calibration reference.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={referenceUrl}
              alt="Local calibration reference"
              className="absolute inset-0 h-full w-full object-contain"
              style={{ opacity: referenceOpacity / 100 }}
            />
          )}
          <svg
            viewBox="0 0 800 400"
            className="absolute inset-0 h-full w-full"
            aria-label={`${TRANSIT_VIEW_LABELS[view]} geometry calibration overlay`}
          >
            <defs>
              <pattern id={patternId} width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M20 0H0V20" fill="none" stroke="rgba(255,255,255,.11)" strokeWidth=".7" />
              </pattern>
              <linearGradient id={`${patternId}-glass`} x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#9dc6d8" stopOpacity=".18" />
                <stop offset="1" stopColor="#5d7580" stopOpacity=".05" />
              </linearGradient>
            </defs>
            {showGrid && <rect width="800" height="400" fill={`url(#${patternId})`} />}
            <TransitBlueprintOutline
              view={view}
              glassId={`${patternId}-glass`}
              configuration={configuration}
              geometry={geometry}
            />
            <g
              fill={outlineOnly ? 'none' : 'rgba(232,195,74,.08)'}
              stroke="rgba(232,195,74,.82)"
              strokeWidth="1.25"
              vectorEffect="non-scaling-stroke"
            >
              {regions.map((region) => (
                <path key={region.id} d={region.path} data-region-id={region.id} />
              ))}
            </g>
            {showLandmarks &&
              view !== 'front' &&
              view !== 'rear' &&
              geometry.landmarks.map((landmark) => (
                <g
                  key={landmark.name}
                  transform={`translate(${landmark.point.x} ${landmark.point.y})`}
                >
                  <circle r="4" fill="#67e8f9" stroke="#071014" strokeWidth="1.5" />
                  <text
                    x="7"
                    y="-7"
                    fill="#a5f3fc"
                    fontSize="9"
                    paintOrder="stroke"
                    stroke="#08080a"
                    strokeWidth="3"
                  >
                    {landmark.name} · {Math.round(landmark.point.x)},{Math.round(landmark.point.y)}
                  </text>
                </g>
              ))}
          </svg>
        </div>
      </div>

      <div className="grid gap-3 text-xs text-white/45 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Overall length"
          value={`${geometry.dimensions.overallLength.toFixed(1)} in`}
        />
        <Metric label="Axle spacing" value={`${geometry.dimensions.wheelbase.toFixed(1)} in`} />
        <Metric
          label="Front / rear overhang"
          value={`${geometry.dimensions.frontOverhang.toFixed(1)} / ${geometry.dimensions.rearOverhang.toFixed(1)} in`}
        />
        <Metric
          label="Roof / body width"
          value={`${geometry.dimensions.roofHeight.toFixed(1)} / ${geometry.dimensions.bodyWidth.toFixed(1)} in`}
        />
      </div>
    </main>
  )
}

const inputClass =
  'min-h-11 w-full rounded-lg border border-white/10 bg-graphite-900 px-3 text-sm text-white outline-none focus:border-gold-400/50'

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-white/45">
      <span className="mb-2 block">{label}</span>
      {children}
    </label>
  )
}

function Toggle({
  label,
  checked,
  setChecked,
}: {
  label: string
  checked: boolean
  setChecked: (checked: boolean) => void
}) {
  return (
    <label className="inline-flex min-h-11 items-center gap-2 text-xs text-white/55">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => setChecked(event.target.checked)}
      />
      {label}
    </label>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[.025] p-3">
      <span className="block text-white/30">{label}</span>
      <strong className="mt-1 block font-mono text-white/65">{value}</strong>
    </div>
  )
}
