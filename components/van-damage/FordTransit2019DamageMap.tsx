'use client'

import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Maximize2, X } from 'lucide-react'
import type { DamageImage, DamageItem } from './inspection-types'
import {
  GENERIC_BLUEPRINT_ID,
  TRANSIT_VIEW_LABELS,
  TRANSIT_VIEW_ORDER,
  buildTransitRegionAriaLabel,
  classifyTransitRegionState,
  getTransitRegionDefinition,
  getTransitViewRegions,
  resolveTransitConfiguration,
  resolveVehicleBlueprint,
  transitConfigurationLabel,
  transitRegionMatches,
  type TransitRegionDefinition,
  type TransitView,
  type VehicleBlueprintInput,
} from '@/lib/van-damage/transit-blueprint'
import { createTransitGeometry } from '@/lib/van-damage/transit-geometry'

type RegionSummary = {
  items: DamageItem[]
  severity: string
  needsReview: boolean
  confirmed: boolean
  repaired: boolean
  dismissed: boolean
}

const severityRank: Record<string, number> = { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 }

export type FordTransit2019DamageMapProps = {
  vehicle: VehicleBlueprintInput
  items: DamageItem[]
  images: DamageImage[]
  activeView: TransitView
  selectedRegion: string | null
  inspectionNeedsReview: boolean
  lifecycle: string
  onViewChange: (view: TransitView) => void
  onSelectRegion: (regionId: string | null, view: TransitView, imageId?: string | null) => void
}

export const FordTransit2019DamageMap = memo(function FordTransit2019DamageMap(
  props: FordTransit2019DamageMapProps
) {
  const blueprint = resolveVehicleBlueprint(props.vehicle)
  const configuration = useMemo(() => resolveTransitConfiguration(props.vehicle), [props.vehicle])
  const [fullscreen, setFullscreen] = useState(false)
  const fullscreenButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!fullscreen) return
    const previousOverflow = document.body.style.overflow
    const trigger = fullscreenButton.current
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', close)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', close)
      trigger?.focus()
    }
  }, [fullscreen])

  if (blueprint === GENERIC_BLUEPRINT_ID) {
    return (
      <GenericVehicleMap
        items={props.items}
        images={props.images}
        selectedRegion={props.selectedRegion}
        onSelectRegion={props.onSelectRegion}
      />
    )
  }

  return (
    <section
      className="rounded-2xl border border-white/10 bg-graphite-800 p-4 md:p-6"
      aria-labelledby="transit-damage-map-heading"
    >
      <MapHeader
        configurationLabel={transitConfigurationLabel(configuration)}
        selectedRegion={props.selectedRegion}
        fullscreenButton={fullscreenButton}
        onClear={() => props.onSelectRegion(null, props.activeView)}
        onFullscreen={() => setFullscreen(true)}
      />
      <TransitMapContent {...props} instance="inline" configuration={configuration} />
      {fullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fullscreen-transit-map-title"
          className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-graphite-950/98 p-4 backdrop-blur-xl md:p-8"
        >
          <div className="mx-auto flex w-full max-w-7xl items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[.18em] text-gold-300/65">
                Interactive blueprint
              </p>
              <h2
                id="fullscreen-transit-map-title"
                className="mt-1 text-xl font-semibold text-white"
              >
                2019 Ford Transit cargo van damage map
              </h2>
              <p className="mt-1 text-xs text-white/35">
                {transitConfigurationLabel(configuration)}
              </p>
            </div>
            <button
              autoFocus
              onClick={() => setFullscreen(false)}
              aria-label="Close fullscreen vehicle damage map"
              className="focus-ring rounded-xl border border-white/10 p-2.5 text-white/55 hover:bg-white/5 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mx-auto mt-6 w-full max-w-7xl rounded-2xl border border-white/10 bg-graphite-900 p-4 md:p-7">
            <TransitMapContent
              {...props}
              instance="fullscreen"
              configuration={configuration}
              large
            />
          </div>
        </div>
      )}
    </section>
  )
})

function MapHeader({
  configurationLabel,
  selectedRegion,
  fullscreenButton,
  onClear,
  onFullscreen,
}: {
  configurationLabel: string
  selectedRegion: string | null
  fullscreenButton: React.RefObject<HTMLButtonElement | null>
  onClear: () => void
  onFullscreen: () => void
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 id="transit-damage-map-heading" className="font-semibold text-white">
          Vehicle damage map
        </h2>
        <p className="mt-1 text-xs text-white/35">
          Original 2019 Ford Transit cargo-van blueprint · {configurationLabel}
        </p>
      </div>
      <div className="no-print flex items-center gap-2">
        {selectedRegion && (
          <button
            onClick={onClear}
            className="focus-ring rounded-lg border border-white/10 px-2.5 py-2 text-xs text-white/45 hover:bg-white/5 hover:text-white"
          >
            Clear selection
          </button>
        )}
        <button
          ref={fullscreenButton}
          onClick={onFullscreen}
          className="focus-ring rounded-lg border border-white/10 p-2 text-white/45 hover:bg-white/5 hover:text-white"
          aria-label="Open fullscreen vehicle damage map"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function TransitMapContent({
  items,
  images,
  activeView,
  selectedRegion,
  inspectionNeedsReview,
  lifecycle,
  onViewChange,
  onSelectRegion,
  configuration,
  instance,
  large = false,
}: FordTransit2019DamageMapProps & {
  configuration: ReturnType<typeof resolveTransitConfiguration>
  instance: string
  large?: boolean
}) {
  const rawId = useId()
  const idPrefix = `transit-${instance}-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const regions = useMemo(
    () => getTransitViewRegions(configuration)[activeView],
    [activeView, configuration]
  )
  const summaries = useMemo(() => {
    const result = new Map<string, RegionSummary>()
    for (const region of regions) {
      const matching = items.filter((item) => transitRegionMatches(region.id, item))
      result.set(region.id, summarizeRegion(matching, inspectionNeedsReview, lifecycle))
    }
    return result
  }, [inspectionNeedsReview, items, lifecycle, regions])
  const damaged = [...summaries.entries()].filter(([, summary]) => summary.items.length > 0)

  function select(region: TransitRegionDefinition) {
    const active = selectedRegion === region.id
    const summary = summaries.get(region.id)
    const imageId =
      summary?.items.find((item) => item.image_id)?.image_id ?? findRoleImage(images, region.id)
    onSelectRegion(active ? null : region.id, activeView, active ? null : imageId)
  }

  return (
    <>
      <div
        role="tablist"
        aria-label="Vehicle blueprint view"
        className="no-print mt-5 flex flex-wrap gap-2"
      >
        {TRANSIT_VIEW_ORDER.map((view) => (
          <button
            key={view}
            role="tab"
            aria-selected={activeView === view}
            aria-controls={`${idPrefix}-panel`}
            onClick={() => onViewChange(view)}
            className={`focus-ring min-h-11 rounded-xl border px-3 py-2 text-xs transition ${
              activeView === view
                ? 'border-gold-400/35 bg-gold-400/10 text-gold-100'
                : 'border-white/10 text-white/45 hover:bg-white/5 hover:text-white/70'
            }`}
          >
            {TRANSIT_VIEW_LABELS[view]}
          </button>
        ))}
      </div>
      <div
        id={`${idPrefix}-panel`}
        role="tabpanel"
        aria-label={`${TRANSIT_VIEW_LABELS[activeView]} vehicle blueprint`}
        className="mt-4 overflow-hidden rounded-2xl border border-white/8 bg-[radial-gradient(circle_at_50%_40%,rgba(201,168,76,.045),transparent_56%),rgba(0,0,0,.12)]"
      >
        <TransitSvg
          activeView={activeView}
          regions={regions}
          summaries={summaries}
          selectedRegion={selectedRegion}
          configuration={configuration}
          idPrefix={idPrefix}
          large={large}
          onSelect={select}
        />
      </div>
      <div
        className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-white/40"
        aria-label="Damage map legend"
      >
        <Legend swatch="bg-white/10" label="No mapped finding" />
        <Legend swatch="bg-emerald-400/70" label="Minor" />
        <Legend swatch="bg-amber-400/70" label="Moderate" />
        <Legend swatch="bg-orange-400/80" label="Severe" />
        <Legend swatch="bg-red-500/80" label="Critical" />
        <span className="inline-flex items-center">
          <span className="mr-1.5 h-3 w-3 rounded border border-white/40 border-dashed" />
          Needs review
        </span>
      </div>
      <div aria-live="polite" className="mt-4 rounded-xl border border-white/8 bg-white/[.02] p-3">
        {selectedRegion ? (
          <RegionTextSummary regionId={selectedRegion} items={items} />
        ) : damaged.length ? (
          <p className="text-xs text-white/50">
            {damaged.length} damaged {damaged.length === 1 ? 'region' : 'regions'} visible in the{' '}
            {TRANSIT_VIEW_LABELS[activeView].toLowerCase()} view. Select a panel for details.
          </p>
        ) : (
          <p className="text-xs text-white/35">
            No findings are mapped to the {TRANSIT_VIEW_LABELS[activeView].toLowerCase()} view.
          </p>
        )}
      </div>
    </>
  )
}

function TransitSvg({
  activeView,
  regions,
  summaries,
  selectedRegion,
  configuration,
  idPrefix,
  large,
  onSelect,
}: {
  activeView: TransitView
  regions: readonly TransitRegionDefinition[]
  summaries: Map<string, RegionSummary>
  selectedRegion: string | null
  configuration: ReturnType<typeof resolveTransitConfiguration>
  idPrefix: string
  large: boolean
  onSelect: (region: TransitRegionDefinition) => void
}) {
  const [focused, setFocused] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const geometry = useMemo(() => createTransitGeometry(configuration), [configuration])

  return (
    <svg
      viewBox="0 0 800 400"
      preserveAspectRatio="xMidYMid meet"
      className={`${large ? 'max-h-[70dvh]' : 'max-h-[430px]'} h-auto w-full`}
      role="group"
      aria-labelledby={`${idPrefix}-title ${idPrefix}-description`}
      data-blueprint="ford-transit-2019"
      data-view={activeView}
    >
      <title id={`${idPrefix}-title`}>
        2019 Ford Transit cargo van, {TRANSIT_VIEW_LABELS[activeView]} damage view
      </title>
      <desc id={`${idPrefix}-description`}>
        Use Tab to reach vehicle regions. Press Enter or Space to select a panel and filter related
        findings.
      </desc>
      <defs>
        <pattern
          id={`${idPrefix}-repaired`}
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="8" height="8" fill="rgba(59,130,246,.13)" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(147,197,253,.65)" strokeWidth="2" />
        </pattern>
        <pattern id={`${idPrefix}-dismissed`} width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="rgba(255,255,255,.18)" />
        </pattern>
        <linearGradient id={`${idPrefix}-glass`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#9dc6d8" stopOpacity=".22" />
          <stop offset="1" stopColor="#5d7580" stopOpacity=".08" />
        </linearGradient>
      </defs>
      <BlueprintGround />
      <g>
        <TransitBlueprintOutline
          view={activeView}
          glassId={`${idPrefix}-glass`}
          configuration={configuration}
          geometry={geometry}
        />
        {regions.map((region) => {
          const summary = summaries.get(region.id) ?? summarizeRegion([], false, '')
          const selected = selectedRegion === region.id
          const interactive = focused === region.id || hovered === region.id
          const presentation = regionPresentation(summary, selected, interactive, idPrefix)
          const ariaLabel = buildTransitRegionAriaLabel({
            label: region.label,
            severity: summary.severity,
            findingCount: summary.items.length,
            needsReview: summary.needsReview,
            confirmed: summary.confirmed,
            repaired: summary.repaired,
            dismissed: summary.dismissed,
            selected,
          })
          return (
            <g
              key={`${activeView}-${region.id}`}
              id={`${idPrefix}-${activeView}-${region.id}`}
              role="button"
              tabIndex={0}
              aria-label={ariaLabel}
              aria-pressed={selected}
              data-region-id={region.id}
              data-region-state={presentation.state}
              className="cursor-pointer outline-none"
              onClick={() => onSelect(region)}
              onMouseEnter={() => setHovered(region.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setFocused(region.id)}
              onBlur={() => setFocused(null)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(region)
                }
              }}
            >
              <path
                d={region.path}
                fill={presentation.fill}
                stroke={presentation.stroke}
                strokeWidth={presentation.strokeWidth}
                strokeDasharray={summary.needsReview ? '8 5' : undefined}
                vectorEffect="non-scaling-stroke"
                className="transition-colors duration-150 motion-reduce:transition-none"
              />
              <path
                d={region.path}
                fill="transparent"
                stroke="transparent"
                strokeWidth={region.small ? 24 : 10}
                vectorEffect="non-scaling-stroke"
              />
              {summary.items.length > 0 && (
                <g aria-hidden="true" pointerEvents="none">
                  <circle
                    cx={region.labelX}
                    cy={region.labelY}
                    r="13"
                    fill="#111114"
                    stroke={presentation.stroke}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={region.labelX}
                    y={region.labelY + 4}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fill="#fff"
                  >
                    {summary.items.length}
                  </text>
                </g>
              )}
            </g>
          )
        })}
        {configuration.rearWheels === 'dual' &&
          (activeView === 'driver' || activeView === 'passenger') && (
            <circle
              cx={geometry.side.rearAxle + 5}
              cy={geometry.side.groundY - geometry.side.wheelRadius}
              r={geometry.side.wheelRadius - 4}
              fill="none"
              stroke="rgba(255,255,255,.22)"
              strokeWidth="5"
              aria-hidden="true"
            />
          )}
      </g>
      <text
        x="400"
        y="389"
        textAnchor="middle"
        fill="rgba(255,255,255,.27)"
        fontSize="11"
        letterSpacing="2"
      >
        2019 FULL-SIZE CARGO VAN · {TRANSIT_VIEW_LABELS[activeView].toUpperCase()}
      </text>
    </svg>
  )
}

export function TransitBlueprintOutline({
  view,
  glassId,
  configuration,
  geometry,
}: {
  view: TransitView
  glassId: string
  configuration: ReturnType<typeof resolveTransitConfiguration>
  geometry: ReturnType<typeof createTransitGeometry>
}) {
  const outline = 'rgba(255,255,255,.27)'
  const subtle = 'rgba(255,255,255,.13)'
  if (view === 'driver' || view === 'passenger') {
    const s = geometry.side
    const wheelY = s.groundY - s.wheelRadius
    const slidingVisible =
      (view === 'passenger' && ['passenger', 'both'].includes(configuration.slidingDoor)) ||
      (view === 'driver' && ['driver', 'both'].includes(configuration.slidingDoor))
    return (
      <g aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path
          d={`M${s.frontEdge} ${s.bodyBottomY} V${s.hoodFront.y + 20} L${s.hoodFront.x} ${s.hoodFront.y} L${s.hoodRear.x} ${s.hoodRear.y} L${s.windshieldTop.x} ${s.windshieldTop.y} Q${s.windshieldTop.x + 8} ${s.roofY} ${s.windshieldTop.x + 28} ${s.roofY} H${s.rearEdge - 38} Q${s.rearEdge - 8} ${s.roofY + 8} ${s.rearEdge} ${s.roofY + 42} V${s.bodyBottomY} H${s.rearAxle + s.wheelRadius} A${s.wheelRadius} ${s.wheelRadius} 0 0 0 ${s.rearAxle - s.wheelRadius} ${s.bodyBottomY} H${s.frontAxle + s.wheelRadius} A${s.wheelRadius} ${s.wheelRadius} 0 0 0 ${s.frontAxle - s.wheelRadius} ${s.bodyBottomY} H${s.frontEdge} Z`}
          fill="rgba(255,255,255,.025)"
          stroke={outline}
          strokeWidth="2.2"
        />
        <path
          d={`M${s.windshieldTop.x} ${s.windshieldTop.y} L${s.windshieldTop.x + 75} ${s.roofY + 11} L${s.windshieldBase.x} ${s.windshieldBase.y} L${s.windshieldBase.x - 20} ${s.windshieldBase.y - 25} Z`}
          fill={`url(#${glassId})`}
          stroke={subtle}
        />
        <path
          d={`M${s.windshieldTop.x + 75} ${s.roofY + 10} H${s.rearEdge - 22} M${s.cabRearX} ${s.roofY + 10} V${s.bodyBottomY} M${s.cargoDoorRearX} ${s.roofY + 10} V${s.bodyBottomY} M${s.rearDoorSeamX} ${s.roofY + 18} V${s.bodyBottomY}`}
          stroke={subtle}
        />
        {slidingVisible && (
          <>
            <path
              d={`M${s.cabRearX + 4} ${s.roofY + 15} H${s.cargoDoorRearX} V${s.bodyBottomY - 24} H${s.cabRearX + 4} Z`}
              stroke="rgba(255,255,255,.22)"
            />
            <path
              d={`M${s.cabRearX + 31} ${s.roofY + 31} H${s.cargoDoorRearX - 14}`}
              stroke="rgba(255,255,255,.2)"
              strokeWidth="3"
            />
          </>
        )}
        {view === 'driver' && (
          <path
            d={`M${s.cabRearX} ${s.roofY + 25} H${s.rearDoorSeamX}`}
            stroke="rgba(255,255,255,.08)"
          />
        )}
        {configuration.cargoConfiguration === 'passenger' && (
          <path
            d={`M${s.cabRearX + 12} ${s.roofY + 24} H${s.cargoDoorRearX - 8} V${s.beltlineY - 8} H${s.cabRearX + 12} Z M${s.cargoDoorRearX + 9} ${s.roofY + 24} H${s.rearDoorSeamX - 8} V${s.beltlineY - 8} H${s.cargoDoorRearX + 9} Z`}
            fill={`url(#${glassId})`}
            stroke={subtle}
          />
        )}
        <circle
          cx={s.frontAxle}
          cy={wheelY}
          r={s.wheelRadius}
          fill="#0d0d0f"
          stroke={outline}
          strokeWidth="6"
        />
        <circle
          cx={s.rearAxle}
          cy={wheelY}
          r={s.wheelRadius}
          fill="#0d0d0f"
          stroke={outline}
          strokeWidth="6"
        />
        <circle cx={s.frontAxle} cy={wheelY} r={s.wheelRadius * 0.36} stroke={subtle} />
        <circle cx={s.rearAxle} cy={wheelY} r={s.wheelRadius * 0.36} stroke={subtle} />
      </g>
    )
  }
  if (view === 'front') {
    const e = geometry.end
    return (
      <g aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path
          d={`M${e.bodyLeft} ${e.bodyBottomY} L${e.bodyLeft + 5} ${e.beltlineY} L${e.bodyLeft + 25} ${e.roofY + 31} Q${e.bodyLeft + 38} ${e.roofY} ${e.bodyLeft + 72} ${e.roofY} H${e.bodyRight - 72} Q${e.bodyRight - 38} ${e.roofY} ${e.bodyRight - 25} ${e.roofY + 31} L${e.bodyRight - 5} ${e.beltlineY} L${e.bodyRight} ${e.bodyBottomY} Z`}
          fill="rgba(255,255,255,.025)"
          stroke={outline}
          strokeWidth="2.2"
        />
        <path
          d={`M${e.bodyLeft + 25} ${e.roofY + 31} H${e.bodyRight - 25} L${e.bodyRight - 46} ${e.beltlineY - 8} H${e.bodyLeft + 46} Z`}
          fill={`url(#${glassId})`}
          stroke={subtle}
        />
        <path
          d={`M400 ${e.roofY + 31} V${e.beltlineY - 8} M${e.bodyLeft + 29} ${e.beltlineY + 35} H${e.bodyRight - 29}`}
          stroke={subtle}
        />
        <path
          d={`M338 ${e.beltlineY + 30} H462 L453 ${e.beltlineY + 64} H347 Z M315 ${e.beltlineY + 75} H485 L466 ${e.bodyBottomY - 10} H334 Z`}
          stroke="rgba(255,255,255,.22)"
        />
      </g>
    )
  }
  if (view === 'rear') {
    const e = geometry.end
    return (
      <g aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path
          d={`M${e.bodyLeft} ${e.bodyBottomY} L${e.bodyLeft + 12} ${e.roofY + 32} Q${e.bodyLeft + 25} ${e.roofY} ${e.bodyLeft + 68} ${e.roofY} H${e.bodyRight - 68} Q${e.bodyRight - 25} ${e.roofY} ${e.bodyRight - 12} ${e.roofY + 32} L${e.bodyRight} ${e.bodyBottomY} Z`}
          fill="rgba(255,255,255,.025)"
          stroke={outline}
          strokeWidth="2.2"
        />
        <path
          d={`M${e.bodyLeft + 22} ${e.roofY + 29} H${e.bodyRight - 22} V${e.bodyBottomY - 35} H${e.bodyLeft + 22} Z M400 ${e.roofY + 29} V${e.bodyBottomY - 35} M${e.bodyLeft + 22} ${e.bodyBottomY - 105} H${e.bodyRight - 22}`}
          stroke={subtle}
        />
        {configuration.rearDoorWindows && (
          <>
            <path
              d={`M${e.bodyLeft + 40} ${e.roofY + 46} H388 V${e.beltlineY + 31} H${e.bodyLeft + 40} Z M412 ${e.roofY + 46} H${e.bodyRight - 40} V${e.beltlineY + 31} H412 Z`}
              fill={`url(#${glassId})`}
              stroke={subtle}
            />
          </>
        )}
        <path
          d={`M${e.bodyLeft - 3} ${e.beltlineY - 45} H${e.bodyLeft + 20} V${e.bodyBottomY - 62} H${e.bodyLeft - 3} Z M${e.bodyRight - 20} ${e.beltlineY - 45} H${e.bodyRight + 3} V${e.bodyBottomY - 62} H${e.bodyRight - 20} Z`}
          stroke="rgba(248,113,113,.35)"
        />
        <path
          d={`M${e.bodyLeft - 7} ${e.bodyBottomY} H${e.bodyRight + 7} V${e.bumperBottomY} H${e.bodyLeft - 7} Z`}
          stroke={subtle}
        />
      </g>
    )
  }
  const t = geometry.top
  return (
    <g aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path
        d={`M${t.frontEdge} ${t.bodyTop + 42} Q${t.frontEdge - 12} ${t.centerY} ${t.frontEdge} ${t.bodyBottom - 42} L${t.windshieldX - 12} ${t.bodyBottom - 14} L${t.windshieldX + 34} ${t.bodyBottom} H${t.rearEdge - 22} Q${t.rearEdge} ${t.bodyBottom - 9} ${t.rearEdge} ${t.bodyBottom - 30} V${t.bodyTop + 30} Q${t.rearEdge} ${t.bodyTop + 9} ${t.rearEdge - 22} ${t.bodyTop} H${t.windshieldX + 34} L${t.windshieldX - 12} ${t.bodyTop + 14} Z`}
        fill="rgba(255,255,255,.025)"
        stroke={outline}
        strokeWidth="2.2"
      />
      <path
        d={`M${t.windshieldX - 12} ${t.bodyTop + 14} L${t.windshieldX + 34} ${t.bodyTop} V${t.bodyBottom} L${t.windshieldX - 12} ${t.bodyBottom - 14} Z`}
        fill={`url(#${glassId})`}
        stroke={subtle}
      />
      <path
        d={`M${t.windshieldX + 34} ${t.bodyTop} V${t.bodyBottom} M${t.cabRearX} ${t.bodyTop} V${t.bodyBottom} M${t.cargoRearX - 80} ${t.bodyTop} V${t.bodyBottom} M${t.cargoRearX} ${t.bodyTop} V${t.bodyBottom}`}
        stroke={subtle}
      />
      <path
        d={`M${t.windshieldX - 33} ${t.bodyTop + 5} Q${t.windshieldX - 20} ${t.mirrorTop - 7} ${t.windshieldX - 2} ${t.mirrorTop} M${t.windshieldX - 33} ${t.bodyBottom - 5} Q${t.windshieldX - 20} ${t.mirrorBottom + 7} ${t.windshieldX - 2} ${t.mirrorBottom}`}
        stroke={outline}
      />
    </g>
  )
}

function BlueprintGround() {
  return (
    <g aria-hidden="true">
      <path d="M40 348 H760" stroke="rgba(255,255,255,.07)" strokeDasharray="4 8" />
      <path d="M400 18 V360" stroke="rgba(255,255,255,.035)" strokeDasharray="3 10" />
    </g>
  )
}

function summarizeRegion(
  items: DamageItem[],
  needsReview: boolean,
  lifecycle: string
): RegionSummary {
  const severity = items.reduce((highest, item) => {
    const itemSeverity = item.severity ?? 'unknown'
    return severityRank[itemSeverity] > severityRank[highest] ? itemSeverity : highest
  }, 'unknown')
  return {
    items,
    severity,
    needsReview: needsReview && items.length > 0,
    confirmed: items.some((item) => Boolean(item.damage_case_id)),
    repaired: lifecycle === 'repaired' && items.length > 0,
    dismissed: ['dismissed', 'rejected', 'archived'].includes(lifecycle) && items.length > 0,
  }
}

function regionPresentation(
  summary: RegionSummary,
  selected: boolean,
  interactive: boolean,
  patternPrefix: string
) {
  const state = classifyTransitRegionState({
    findingCount: summary.items.length,
    severity: summary.severity,
    needsReview: summary.needsReview,
    confirmed: summary.confirmed,
    repaired: summary.repaired,
    dismissed: summary.dismissed,
    selected,
  })
  if (!summary.items.length)
    return {
      fill: interactive || selected ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.035)',
      stroke: selected
        ? '#e8c34a'
        : interactive
          ? 'rgba(255,255,255,.72)'
          : 'rgba(255,255,255,.17)',
      strokeWidth: selected ? 3 : interactive ? 2.5 : 1.4,
      state,
    }
  if (summary.repaired)
    return {
      fill: `url(#${patternPrefix}-repaired)`,
      stroke: selected ? '#f7d873' : '#93c5fd',
      strokeWidth: selected ? 3 : 2,
      state,
    }
  if (summary.dismissed)
    return {
      fill: `url(#${patternPrefix}-dismissed)`,
      stroke: selected ? '#f7d873' : 'rgba(255,255,255,.3)',
      strokeWidth: selected ? 3 : 1.5,
      state,
    }
  const colors: Record<string, [string, string]> = {
    low: ['rgba(52,211,153,.28)', '#6ee7b7'],
    medium: ['rgba(251,191,36,.3)', '#fcd34d'],
    high: ['rgba(251,146,60,.34)', '#fdba74'],
    critical: ['rgba(239,68,68,.38)', '#fca5a5'],
    unknown: ['rgba(148,163,184,.25)', '#cbd5e1'],
  }
  const [fill, stroke] = colors[summary.severity] ?? colors.unknown
  return {
    fill,
    stroke: selected ? '#fff2ad' : interactive ? '#fff' : stroke,
    strokeWidth: selected ? 3.5 : interactive ? 3 : 2,
    state,
  }
}

function RegionTextSummary({ regionId, items }: { regionId: string; items: DamageItem[] }) {
  const definition = getTransitRegionDefinition(regionId)
  const matches = items.filter((item) => transitRegionMatches(regionId, item))
  if (!definition)
    return (
      <p className="text-xs text-white/40">
        The selected historical region is not mapped to this blueprint.
      </p>
    )
  if (!matches.length)
    return (
      <p className="text-xs text-white/45">
        <span className="font-medium text-white/65">{definition.label}:</span> no mapped findings.
      </p>
    )
  return (
    <div>
      <p className="text-xs font-medium text-white/65">
        {definition.label} · {matches.length} {matches.length === 1 ? 'finding' : 'findings'}
      </p>
      <ul className="mt-2 space-y-1 text-[11px] text-white/40">
        {matches.slice(0, 4).map((item) => (
          <li key={item.id}>
            • {humanize(item.damage_type)} · {humanize(item.severity)}
          </li>
        ))}
      </ul>
    </div>
  )
}

function GenericVehicleMap({
  items,
  images,
  selectedRegion,
  onSelectRegion,
}: Pick<FordTransit2019DamageMapProps, 'items' | 'images' | 'selectedRegion' | 'onSelectRegion'>) {
  const regions = [
    { id: 'front_bumper', label: 'Front', x: 400, y: 62 },
    { id: 'rear_bumper', label: 'Rear', x: 400, y: 298 },
    { id: 'driver_cargo_panel', label: 'Driver side', x: 215, y: 180 },
    { id: 'passenger_sliding_door', label: 'Passenger side', x: 585, y: 180 },
    { id: 'roof_center', label: 'Roof', x: 400, y: 180 },
  ]
  return (
    <section
      className="rounded-2xl border border-white/10 bg-graphite-800 p-5 md:p-6"
      aria-labelledby="generic-damage-map-heading"
    >
      <h2 id="generic-damage-map-heading" className="font-semibold text-white">
        Vehicle damage map
      </h2>
      <p className="mt-1 text-xs text-white/35">
        A model-specific blueprint is unavailable for this vehicle. Historical regions remain
        selectable.
      </p>
      <div className="mt-5 overflow-hidden rounded-2xl border border-white/8 bg-black/10">
        <svg
          viewBox="0 0 800 360"
          className="w-full"
          role="group"
          aria-label="Generic vehicle damage map"
        >
          <path
            d="M250 38 H550 L646 112 V248 L550 322 H250 L154 248 V112 Z"
            fill="rgba(255,255,255,.035)"
            stroke="rgba(255,255,255,.2)"
            strokeWidth="2"
          />
          <path
            d="M287 83 H513 L584 130 V230 L513 277 H287 L216 230 V130 Z"
            fill="rgba(0,0,0,.2)"
            stroke="rgba(255,255,255,.1)"
          />
          {regions.map((region) => {
            const matching = items.filter((item) => transitRegionMatches(region.id, item))
            const selected = selectedRegion === region.id
            return (
              <g
                key={region.id}
                role="button"
                tabIndex={0}
                aria-label={`${region.label}, ${matching.length} findings${selected ? ', selected' : ''}`}
                aria-pressed={selected}
                onClick={() => {
                  const next = selected ? null : region.id
                  const imageId =
                    matching.find((item) => item.image_id)?.image_id ??
                    findRoleImage(images, region.id)
                  onSelectRegion(
                    next,
                    getTransitRegionDefinition(region.id)?.view ?? 'top',
                    next ? imageId : null
                  )
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.currentTarget.dispatchEvent(new MouseEvent('click', { bubbles: true }))
                  }
                }}
                className="cursor-pointer outline-none"
              >
                <circle
                  cx={region.x}
                  cy={region.y}
                  r="36"
                  fill={matching.length ? 'rgba(251,146,60,.35)' : 'rgba(255,255,255,.07)'}
                  stroke={selected ? '#e8c34a' : 'rgba(255,255,255,.28)'}
                  strokeWidth={selected ? 4 : 2}
                />
                <text x={region.x} y={region.y + 4} textAnchor="middle" fill="white" fontSize="12">
                  {region.label}
                  {matching.length ? ` ${matching.length}` : ''}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <p className="mt-4 flex items-start text-xs text-amber-100/55">
        <AlertTriangle className="mr-2 mt-0.5 h-3.5 w-3.5 shrink-0" />
        The 2019 Transit blueprint is intentionally not shown for vehicles identified as another
        model.
      </p>
    </section>
  )
}

function findRoleImage(images: DamageImage[], regionId: string) {
  const terms = regionId.split('_')
  return images.find((image) => terms.some((term) => image.image_role?.includes(term)))?.id ?? null
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center">
      <span className={`mr-1.5 h-2.5 w-2.5 rounded-sm ${swatch}`} />
      {label}
    </span>
  )
}

function humanize(value: string | null | undefined) {
  return value ? value.replaceAll('_', ' ') : 'unknown'
}
