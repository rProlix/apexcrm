// lib/website/design/contrast.ts
// WCAG contrast ratio helpers — pure math, no browser APIs required.

export interface Rgb { r: number; g: number; b: number }

/** Parse a CSS hex color (#rgb, #rrggbb, #rrggbbaa) into 0-255 components. */
export function hexToRgb(hex: string): Rgb | null {
  if (typeof hex !== 'string') return null
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3 || h.length === 4) {
    h = h.split('').map((c) => c + c).join('')
  }
  if (h.length !== 6 && h.length !== 8) return null
  const n = parseInt(h.slice(0, 6), 16)
  if (isNaN(n)) return null
  return {
    r: (n >> 16) & 0xff,
    g: (n >> 8) & 0xff,
    b: n & 0xff,
  }
}

/** sRGB linearize a 0-255 channel value → 0..1 */
function linearize(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance of an RGB colour (0..1) */
export function getRelativeLuminance(rgb: Rgb): number {
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b)
}

/** WCAG contrast ratio between two colors (1..21). */
export function getContrastRatio(fg: Rgb, bg: Rgb): number {
  const l1 = getRelativeLuminance(fg)
  const l2 = getRelativeLuminance(bg)
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Passes WCAG AA at the given minimum ratio?
 * Normal text: 4.5:1  |  Large text: 3:1  |  UI components: 3:1
 */
export function passesWcag(
  fg:    string,
  bg:    string,
  level: 'AA' | 'AAA' = 'AA',
  size:  'normal' | 'large' = 'normal',
): boolean {
  const fgRgb = hexToRgb(fg)
  const bgRgb = hexToRgb(bg)
  if (!fgRgb || !bgRgb) return false
  const ratio = getContrastRatio(fgRgb, bgRgb)
  if (level === 'AAA') return size === 'large' ? ratio >= 4.5 : ratio >= 7
  return size === 'large' ? ratio >= 3 : ratio >= 4.5
}

/**
 * Choose the more readable foreground color (black or white) against a background.
 * Returns '#ffffff' or '#1a1a1a'.
 */
export function chooseReadableTextColor(bg: string): '#ffffff' | '#1a1a1a' {
  const rgb = hexToRgb(bg)
  if (!rgb) return '#1a1a1a'
  const lum = getRelativeLuminance(rgb)
  return lum > 0.179 ? '#1a1a1a' : '#ffffff'
}

/**
 * Ensure a foreground color passes WCAG AA against a background.
 * Returns the original fg if it passes, otherwise flips to white or black.
 */
export function ensureContrast(
  fg:    string,
  bg:    string,
  level: 'AA' | 'AAA' = 'AA',
): string {
  if (passesWcag(fg, bg, level)) return fg
  const white = passesWcag('#ffffff', bg, level)
  const black = passesWcag('#1a1a1a', bg, level)
  if (!white && !black) {
    // Pick whichever is closer to passing
    const wRgb = hexToRgb('#ffffff')!
    const bRgb = hexToRgb('#1a1a1a')!
    const bgRgb = hexToRgb(bg)
    if (!bgRgb) return '#1a1a1a'
    const wRatio = getContrastRatio(wRgb, bgRgb)
    const bRatio = getContrastRatio(bRgb, bgRgb)
    return wRatio > bRatio ? '#ffffff' : '#1a1a1a'
  }
  return white ? '#ffffff' : '#1a1a1a'
}

/**
 * Given a text color and background, build a gradient overlay value
 * that ensures text readability over an image/gradient section.
 */
export function buildReadableOverlay(bg: string): string {
  const readableText = chooseReadableTextColor(bg)
  return readableText === '#ffffff'
    ? 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.25) 100%)'
    : 'linear-gradient(to bottom, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.3) 100%)'
}

/**
 * Quick heuristic: is this hex color "dark"? (luminance < 0.18)
 */
export function isDark(hex: string): boolean {
  const rgb = hexToRgb(hex)
  if (!rgb) return false
  return getRelativeLuminance(rgb) < 0.18
}

/**
 * Lighten a hex color by a percentage (0-100).
 */
export function lightenHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const factor = amount / 100
  const r = Math.round(Math.min(255, rgb.r + (255 - rgb.r) * factor))
  const g = Math.round(Math.min(255, rgb.g + (255 - rgb.g) * factor))
  const b = Math.round(Math.min(255, rgb.b + (255 - rgb.b) * factor))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Darken a hex color by a percentage (0-100).
 */
export function darkenHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const factor = 1 - amount / 100
  const r = Math.round(Math.max(0, rgb.r * factor))
  const g = Math.round(Math.max(0, rgb.g * factor))
  const b = Math.round(Math.max(0, rgb.b * factor))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Return a hex color at some alpha over white or black.
 * e.g. hexWithAlphaOnWhite('#ff0000', 0.1) → lightest tint of red
 */
export function tintColor(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const r = Math.round(255 * (1 - alpha) + rgb.r * alpha)
  const g = Math.round(255 * (1 - alpha) + rgb.g * alpha)
  const b = Math.round(255 * (1 - alpha) + rgb.b * alpha)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
