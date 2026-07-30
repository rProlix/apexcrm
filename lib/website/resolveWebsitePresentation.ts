import type { CSSProperties } from 'react'
import type { SiteSettings, WebsiteTheme } from './types'
import { normalizeTheme } from './normalizeTheme'
import { buildCssVars, normalizeDesignSystem } from './design/normalizeDesignSystem'

export interface WebsitePresentation {
  theme: WebsiteTheme
  cssVars: CSSProperties
}

/**
 * Authoritative color and typography resolution for both the builder preview
 * and the published website. The canonical design system wins over legacy
 * theme fields, while both paths receive the same accessible interaction roles.
 */
export function resolveWebsitePresentation(settings: SiteSettings): WebsitePresentation {
  const theme = normalizeTheme(settings)
  const cssVars: Record<string, string> = {
    '--color-primary': theme.primaryColor,
    '--color-primary-foreground': theme.primaryForeground,
    '--color-primary-hover': theme.primaryHover,
    '--color-primary-active': theme.primaryActive,
    '--color-primary-soft': theme.primarySoft,
    '--color-accent': theme.accentColor,
    '--color-link': theme.linkColor,
    '--color-focus': theme.focusColor,
    '--color-bg': theme.backgroundColor,
    '--color-surface': theme.surfaceColor,
    '--color-text': theme.textColor,
    '--color-muted': theme.mutedColor,
    '--color-border': theme.borderColor,
    '--font-heading': `"${theme.fontHeading}", sans-serif`,
    '--font-body': `"${theme.fontBody}", sans-serif`,
  }

  const rawTheme = settings.theme as Record<string, unknown> | null
  const source =
    settings.design_system && Object.keys(settings.design_system).length > 0
      ? settings.design_system
      : rawTheme?.palette
        ? rawTheme
        : null

  if (source) {
    const sourceRecord = source as Record<string, unknown>
    const category =
      typeof sourceRecord.businessCategory === 'string' ? sourceRecord.businessCategory : null
    Object.assign(cssVars, buildCssVars(normalizeDesignSystem(source, category)))
  }

  return { theme, cssVars: cssVars as CSSProperties }
}
