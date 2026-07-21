'use client'

import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Maximize2, X } from 'lucide-react'
import type { DamageImage, DamageItem } from './inspection-types'
import {
  GENERIC_BLUEPRINT_ID,
  DRIVER_SLIDING_DOOR_REGION,
  PASSENGER_CARGO_PANEL_REGION,
  TRANSIT_VIEW_LABELS,
  TRANSIT_VIEW_ORDER,
  TRANSIT_VIEW_REGIONS,
  buildTransitRegionAriaLabel,
  classifyTransitRegionState,
  getTransitRegionDefinition,
  resolveTransitConfiguration,
  resolveVehicleBlueprint,
  transitConfigurationLabel,
  transitRegionMatches,
  type TransitRegionDefinition,
  type TransitView,
  type VehicleBlueprintInput,
} from '@/lib/van-damage/transit-blueprint'

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
    () =>
      TRANSIT_VIEW_REGIONS[activeView].map((region) => {
        if (
          activeView === 'driver' &&
          region.id === 'driver_cargo_panel' &&
          ['driver', 'both'].includes(configuration.slidingDoor)
        ) {
          return DRIVER_SLIDING_DOOR_REGION
        }
        if (
          activeView === 'passenger' &&
          region.id === 'passenger_sliding_door' &&
          !['passenger', 'both'].includes(configuration.slidingDoor)
        ) {
          return PASSENGER_CARGO_PANEL_REGION
        }
        return region
      }),
    [activeView, configuration.slidingDoor]
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
  const scaleX =
    activeView === 'front' || activeView === 'rear'
      ? 1
      : configuration.wheelbase === 'regular'
        ? 0.92
        : configuration.wheelbase === 'extended'
          ? 1.045
          : 1
  const scaleY =
    activeView === 'top'
      ? 1
      : configuration.roofHeight === 'low'
        ? 0.91
        : configuration.roofHeight === 'high'
          ? 1.055
          : 1
  const transform = `translate(${400 - 400 * scaleX} ${310 - 310 * scaleY}) scale(${scaleX} ${scaleY})`

  return (
    <svg
      viewBox="0 0 800 360"
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
      <g transform={transform}>
        <TransitBlueprintOutline
          view={activeView}
          glassId={`${idPrefix}-glass`}
          configuration={configuration}
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
              cx="604"
              cy="273"
              r="29"
              fill="none"
              stroke="rgba(255,255,255,.22)"
              strokeWidth="5"
              aria-hidden="true"
            />
          )}
      </g>
      <text
        x="400"
        y="342"
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

function TransitBlueprintOutline({
  view,
  glassId,
  configuration,
}: {
  view: TransitView
  glassId: string
  configuration: ReturnType<typeof resolveTransitConfiguration>
}) {
  const outline = 'rgba(255,255,255,.27)'
  const subtle = 'rgba(255,255,255,.13)'
  if (view === 'driver' || view === 'passenger') {
    const slidingVisible =
      (view === 'passenger' && ['passenger', 'both'].includes(configuration.slidingDoor)) ||
      (view === 'driver' && ['driver', 'both'].includes(configuration.slidingDoor))
    return (
      <g aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M58 288 V244 L66 192 L73 168 L196 151 L199 49 Q206 37 230 34 H520 L560 52 L676 58 L721 92 L733 130 V247 L750 247 V287 H642 A38 38 0 0 0 566 287 H208 A38 38 0 0 0 132 287 H58 Z"
          fill="rgba(255,255,255,.025)"
          stroke={outline}
          strokeWidth="2.2"
        />
        <path
          d="M201 73 L282 70 L274 173 L220 185 L196 151 Z"
          fill={`url(#${glassId})`}
          stroke={subtle}
        />
        <path
          d="M282 70 H676 M391 70 V267 M563 70 V267 M704 111 V267 M242 292 H702"
          stroke={subtle}
        />
        {slidingVisible && (
          <>
            <path d="M394 76 H574 V267 H394 Z" stroke="rgba(255,255,255,.22)" />
            <path d="M421 91 H559" stroke="rgba(255,255,255,.2)" strokeWidth="3" />
          </>
        )}
        {view === 'driver' && <path d="M394 84 H676" stroke="rgba(255,255,255,.08)" />}
        <circle cx="170" cy="273" r="31" fill="#0d0d0f" stroke={outline} strokeWidth="6" />
        <circle cx="604" cy="273" r="31" fill="#0d0d0f" stroke={outline} strokeWidth="6" />
        <circle cx="170" cy="273" r="11" stroke={subtle} />
        <circle cx="604" cy="273" r="11" stroke={subtle} />
      </g>
    )
  }
  if (view === 'front') {
    return (
      <g aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M205 294 L210 169 L232 72 L251 42 Q263 22 300 18 H500 Q537 22 549 42 L568 72 L590 169 L595 294 Z"
          fill="rgba(255,255,255,.025)"
          stroke={outline}
          strokeWidth="2.2"
        />
        <path d="M259 79 H541 L520 169 H280 Z" fill={`url(#${glassId})`} stroke={subtle} />
        <path d="M400 80 V169 M281 174 H519 M250 217 H550 M302 231 H498" stroke={subtle} />
        <path
          d="M330 190 H470 L459 224 H341 Z M302 231 H498 L479 278 H321 Z"
          stroke="rgba(255,255,255,.22)"
        />
      </g>
    )
  }
  if (view === 'rear') {
    return (
      <g aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M205 313 L218 94 L232 72 L239 49 Q250 24 286 20 H514 Q550 24 561 49 L568 72 L582 94 L595 313 Z"
          fill="rgba(255,255,255,.025)"
          stroke={outline}
          strokeWidth="2.2"
        />
        <path d="M244 77 H556 V283 H244 Z M400 77 V283 M244 222 H556" stroke={subtle} />
        {configuration.cargoConfiguration === 'passenger' && (
          <>
            <path
              d="M262 92 H386 V202 H262 Z M414 92 H538 V202 H414 Z"
              fill={`url(#${glassId})`}
              stroke={subtle}
            />
          </>
        )}
        <path
          d="M218 94 L244 90 V230 L218 224 Z M582 94 L556 90 V230 L582 224 Z"
          stroke="rgba(248,113,113,.35)"
        />
        <path d="M202 276 H598 V313 H202 Z" stroke={subtle} />
      </g>
    )
  }
  return (
    <g aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M52 125 Q42 180 52 235 L90 235 L218 224 L272 264 L700 262 L744 242 V118 L700 98 L272 96 L218 136 L90 125 Z"
        fill="rgba(255,255,255,.025)"
        stroke={outline}
        strokeWidth="2.2"
      />
      <path d="M218 136 L268 113 V247 L218 224 Z" fill={`url(#${glassId})`} stroke={subtle} />
      <path d="M272 96 V264 M410 86 V274 M566 86 V274 M700 98 V262" stroke={subtle} />
      <path
        d="M198 106 Q209 83 232 88 L244 116 M198 254 Q209 277 232 272 L244 244"
        stroke={outline}
      />
    </g>
  )
}

function BlueprintGround() {
  return (
    <g aria-hidden="true">
      <path d="M40 321 H760" stroke="rgba(255,255,255,.07)" strokeDasharray="4 8" />
      <path d="M400 18 V322" stroke="rgba(255,255,255,.035)" strokeDasharray="3 10" />
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
