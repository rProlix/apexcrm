export interface BrandColorRoles {
  primary: string
  primaryForeground: '#111318' | '#ffffff'
  primaryHover: string
  primaryActive: string
  primarySoft: string
  focus: string
  link: string
  scale: Record<ColorScaleStep, string>
}

export type ColorScaleStep = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900

const HEX = /^#([0-9a-f]{6})$/i
const SCALE_STEPS: ColorScaleStep[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]

export function normalizeHexColor(value: unknown, fallback: string): string {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (HEX.test(candidate)) return candidate
  const normalizedFallback = fallback.trim().toLowerCase()
  return HEX.test(normalizedFallback) ? normalizedFallback : '#64748b'
}

export function colorContrast(foreground: string, background: string): number {
  const fg = rgb(normalizeHexColor(foreground, '#111318'))
  const bg = rgb(normalizeHexColor(background, '#ffffff'))
  const lighter = Math.max(luminance(fg), luminance(bg))
  const darker = Math.min(luminance(fg), luminance(bg))
  return (lighter + 0.05) / (darker + 0.05)
}

export function readableForeground(background: string): '#111318' | '#ffffff' {
  return colorContrast('#111318', background) >= colorContrast('#ffffff', background)
    ? '#111318'
    : '#ffffff'
}

export function mixHex(first: string, second: string, secondWeight: number): string {
  const a = rgb(normalizeHexColor(first, '#000000'))
  const b = rgb(normalizeHexColor(second, '#ffffff'))
  const weight = Math.min(1, Math.max(0, secondWeight))
  return toHex({
    r: Math.round(a.r * (1 - weight) + b.r * weight),
    g: Math.round(a.g * (1 - weight) + b.g * weight),
    b: Math.round(a.b * (1 - weight) + b.b * weight),
  })
}

export function ensureColorContrast(candidate: string, background: string, minimum = 4.5): string {
  const color = normalizeHexColor(candidate, '#2563eb')
  const bg = normalizeHexColor(background, '#ffffff')
  if (colorContrast(color, bg) >= minimum) return color

  const toward = luminance(rgb(bg)) > 0.45 ? '#000000' : '#ffffff'
  for (let weight = 0.08; weight <= 0.96; weight += 0.08) {
    const adjusted = mixHex(color, toward, weight)
    if (colorContrast(adjusted, bg) >= minimum) return adjusted
  }
  return readableForeground(bg)
}

export function deriveBrandColorRoles(
  primaryValue: unknown,
  canvasValue: unknown,
  fallback = '#c9a84c'
): BrandColorRoles {
  const primary = normalizeHexColor(primaryValue, fallback)
  const canvas = normalizeHexColor(canvasValue, '#ffffff')
  const canvasIsDark = luminance(rgb(canvas)) < 0.3
  const scale = buildColorScale(primary)

  return {
    primary,
    primaryForeground: readableForeground(primary),
    primaryHover: mixHex(primary, '#000000', 0.1),
    primaryActive: mixHex(primary, '#000000', 0.18),
    primarySoft: mixHex(canvas, primary, canvasIsDark ? 0.17 : 0.1),
    focus: ensureColorContrast(primary, canvas, 3),
    link: ensureColorContrast(primary, canvas, 4.5),
    scale,
  }
}

export function buildColorScale(primaryValue: unknown): Record<ColorScaleStep, string> {
  const primary = normalizeHexColor(primaryValue, '#c9a84c')
  const values = [
    mixHex(primary, '#ffffff', 0.92),
    mixHex(primary, '#ffffff', 0.82),
    mixHex(primary, '#ffffff', 0.64),
    mixHex(primary, '#ffffff', 0.42),
    mixHex(primary, '#ffffff', 0.18),
    primary,
    mixHex(primary, '#000000', 0.12),
    mixHex(primary, '#000000', 0.26),
    mixHex(primary, '#000000', 0.4),
    mixHex(primary, '#000000', 0.54),
  ]
  return Object.fromEntries(SCALE_STEPS.map((step, index) => [step, values[index]])) as Record<
    ColorScaleStep,
    string
  >
}

export function hexToRgbTriplet(value: string): string {
  const valueRgb = rgb(normalizeHexColor(value, '#64748b'))
  return `${valueRgb.r} ${valueRgb.g} ${valueRgb.b}`
}

function rgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

function toHex(value: { r: number; g: number; b: number }): string {
  return `#${[value.r, value.g, value.b]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

function luminance(value: { r: number; g: number; b: number }): number {
  const channel = (input: number) => {
    const normalized = input / 255
    return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(value.r) + 0.7152 * channel(value.g) + 0.0722 * channel(value.b)
}
