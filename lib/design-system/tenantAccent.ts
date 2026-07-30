import { deriveBrandColorRoles, hexToRgbTriplet, type ColorScaleStep } from './colorTheory'

export interface SafeTenantAccent {
  accent: string
  accentRgb: string
  foreground: '#080b11' | '#ffffff'
  hover: string
  active: string
  soft: string
  focus: string
  scale: Record<ColorScaleStep, string>
  scaleRgb: Record<ColorScaleStep, string>
  wasAdjusted: boolean
}

export const DEFAULT_TENANT_ACCENT = '#c9a84c'

const HEX_COLOR = /^#([0-9a-f]{6})$/i

export function resolveSafeTenantAccent(value: unknown): SafeTenantAccent {
  const normalized =
    typeof value === 'string' && HEX_COLOR.test(value.trim())
      ? value.trim().toLowerCase()
      : DEFAULT_TENANT_ACCENT
  const [red, green, blue] = hexToRgb(normalized)
  const luminance = relativeLuminance(red, green, blue)

  // Very dark colors disappear into the command-center canvas and very light
  // colors lose hierarchy against white text. Fall back instead of silently
  // producing inaccessible tenant chrome.
  const unsafe = luminance < 0.12 || luminance > 0.82
  const accent = unsafe ? DEFAULT_TENANT_ACCENT : normalized
  const roles = deriveBrandColorRoles(accent, '#06090e', DEFAULT_TENANT_ACCENT)
  const scaleRgb = Object.fromEntries(
    Object.entries(roles.scale).map(([step, color]) => [step, hexToRgbTriplet(color)])
  ) as Record<ColorScaleStep, string>

  return {
    accent,
    accentRgb: hexToRgbTriplet(accent),
    foreground: roles.primaryForeground === '#111318' ? '#080b11' : '#ffffff',
    hover: roles.primaryHover,
    active: roles.primaryActive,
    soft: roles.primarySoft,
    focus: roles.focus,
    scale: roles.scale,
    scaleRgb,
    wasAdjusted: unsafe || normalized !== value,
  }
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

function relativeLuminance(red: number, green: number, blue: number): number {
  const channel = (value: number) => {
    const normalized = value / 255
    return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
}
