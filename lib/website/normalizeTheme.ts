// lib/website/normalizeTheme.ts
import type { SiteSettings, WebsiteTheme, WebsiteBrandColors, WebsiteFont } from './types'
import {
  deriveBrandColorRoles,
  colorContrast,
  ensureColorContrast,
  mixHex,
  normalizeHexColor,
} from '@/lib/design-system/colorTheory'

// ── Defaults ──────────────────────────────────────────────────────────────────

const DARK_DEFAULTS: WebsiteTheme = {
  primaryColor: '#c9a84c',
  primaryForeground: '#111318',
  primaryHover: '#b59744',
  primaryActive: '#a5893e',
  primarySoft: '#272517',
  accentColor: '#e8c34a',
  linkColor: '#e8c34a',
  focusColor: '#c9a84c',
  backgroundColor: '#08080a',
  surfaceColor: '#141416',
  textColor: '#ffffff',
  mutedColor: 'rgba(255,255,255,0.5)',
  borderColor: '#2e2e36',
  fontHeading: 'Inter',
  fontBody: 'Inter',
  borderRadius: 'lg',
  mode: 'dark',
}

const LIGHT_OVERRIDES: Partial<WebsiteTheme> = {
  backgroundColor: '#ffffff',
  surfaceColor: '#f8f8f8',
  textColor: '#0d0d0f',
  mutedColor: 'rgba(0,0,0,0.5)',
  borderColor: '#e5e5ea',
}

// ── Main normalizer ───────────────────────────────────────────────────────────

/**
 * Converts database site_settings into a fully-resolved WebsiteTheme.
 * Merges brand_colors, fonts, and theme jsonb in order of specificity.
 * Safe to call with null — returns the platform default dark theme.
 */
export function normalizeTheme(settings: SiteSettings | null): WebsiteTheme {
  if (!settings) return { ...DARK_DEFAULTS }

  const colors = (settings.brand_colors ?? {}) as Partial<WebsiteBrandColors>
  const fonts = (settings.fonts ?? {}) as Partial<WebsiteFont>
  const theme = (settings.theme ?? {}) as Partial<WebsiteTheme>

  const mode = (theme.mode ?? DARK_DEFAULTS.mode) as 'dark' | 'light'
  const modeDefaults = mode === 'light' ? LIGHT_OVERRIDES : {}

  const backgroundColor = normalizeHexColor(
    colors.background ?? theme.backgroundColor,
    modeDefaults.backgroundColor ?? DARK_DEFAULTS.backgroundColor
  )
  const primaryColor = normalizeHexColor(
    colors.primary ?? theme.primaryColor,
    DARK_DEFAULTS.primaryColor
  )
  const roles = deriveBrandColorRoles(primaryColor, backgroundColor, DARK_DEFAULTS.primaryColor)
  const fallbackText = mode === 'light' ? '#0d0d0f' : '#ffffff'
  const textColor = ensureColorContrast(
    normalizeHexColor(colors.text ?? theme.textColor, fallbackText),
    backgroundColor
  )
  const requestedSurface = normalizeHexColor(
    colors.surface ?? theme.surfaceColor,
    modeDefaults.surfaceColor ?? DARK_DEFAULTS.surfaceColor
  )
  const surfaceColor =
    colorContrast(textColor, requestedSurface) >= 4.5
      ? requestedSurface
      : mixHex(backgroundColor, textColor, mode === 'dark' ? 0.06 : 0.035)
  const requestedBorder = normalizeHexColor(
    colors.border ?? theme.borderColor,
    modeDefaults.borderColor ?? DARK_DEFAULTS.borderColor
  )
  const borderColor =
    colorContrast(requestedBorder, backgroundColor) >= 1.5
      ? requestedBorder
      : mixHex(backgroundColor, textColor, 0.2)

  return {
    primaryColor: roles.primary,
    primaryForeground: roles.primaryForeground,
    primaryHover: roles.primaryHover,
    primaryActive: roles.primaryActive,
    primarySoft: roles.primarySoft,
    accentColor: normalizeHexColor(colors.accent ?? theme.accentColor, roles.scale[300]),
    linkColor: roles.link,
    focusColor: roles.focus,
    backgroundColor,
    surfaceColor,
    textColor,
    mutedColor:
      colors.muted ?? theme.mutedColor ?? modeDefaults.mutedColor ?? DARK_DEFAULTS.mutedColor,
    borderColor,
    fontHeading: fonts.heading ?? theme.fontHeading ?? DARK_DEFAULTS.fontHeading,
    fontBody: fonts.body ?? theme.fontBody ?? DARK_DEFAULTS.fontBody,
    borderRadius: theme.borderRadius ?? DARK_DEFAULTS.borderRadius,
    mode,
  }
}

// ── CSS custom property helpers ───────────────────────────────────────────────

/**
 * Converts a WebsiteTheme into a CSS custom property map.
 * Inject as inline style on the root site shell element.
 */
export function themeToCssVars(theme: WebsiteTheme): Record<string, string> {
  return {
    '--site-primary': theme.primaryColor,
    '--site-primary-foreground': theme.primaryForeground,
    '--site-primary-hover': theme.primaryHover,
    '--site-primary-active': theme.primaryActive,
    '--site-primary-soft': theme.primarySoft,
    '--site-accent': theme.accentColor,
    '--site-link': theme.linkColor,
    '--site-focus': theme.focusColor,
    '--site-bg': theme.backgroundColor,
    '--site-surface': theme.surfaceColor,
    '--site-text': theme.textColor,
    '--site-muted': theme.mutedColor,
    '--site-border': theme.borderColor,
    '--site-font-head': `'${theme.fontHeading}', Inter, ui-sans-serif, system-ui`,
    '--site-font-body': `'${theme.fontBody}', Inter, ui-sans-serif, system-ui`,
  }
}

/**
 * Maps the theme's borderRadius token to a Tailwind class.
 */
export function themeRadiusClass(theme: WebsiteTheme): string {
  const map: Record<string, string> = {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    full: 'rounded-full',
  }
  return map[theme.borderRadius] ?? 'rounded-lg'
}

/**
 * Returns a safe hex color or falls back to the default primary.
 * Useful when rendering user-supplied color values inline.
 */
export function safeColor(
  value: string | undefined,
  fallback = DARK_DEFAULTS.primaryColor
): string {
  if (!value) return fallback
  // Accept hex, rgb(), rgba(), hsl(), or CSS named colors
  if (/^(#[0-9a-fA-F]{3,8}|rgb|rgba|hsl|hsla|[a-z]+)/.test(value.trim())) {
    return value.trim()
  }
  return fallback
}

/**
 * Builds the Google Fonts import URL for the configured heading and body fonts.
 * Returns null if both fonts are system fonts that don't need importing.
 */
export function buildGoogleFontsUrl(theme: WebsiteTheme): string | null {
  const SYSTEM_FONTS = new Set(['Inter', 'system-ui', 'ui-sans-serif', 'Arial', 'Helvetica'])
  const fonts = Array.from(new Set([theme.fontHeading, theme.fontBody])).filter(
    (f) => !SYSTEM_FONTS.has(f)
  )

  if (fonts.length === 0) return null

  const families = fonts
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
    .join('&')

  return `https://fonts.googleapis.com/css2?${families}&display=swap`
}
