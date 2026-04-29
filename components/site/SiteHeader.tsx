// components/site/SiteHeader.tsx
import Link from 'next/link'
import Image from 'next/image'
import type { PublishedSiteConfig } from '@/lib/website/types'

interface Props {
  config:          PublishedSiteConfig
  /**
   * Base path prefix for all internal tenant links.
   * Set to `/sites/[tenantSlug]` when serving via the platform root domain,
   * or empty string `''` when serving via subdomain / custom domain.
   */
  basePath?:       string
  /**
   * Whether the current visitor has an active customer session.
   * Used to toggle between "Login" and "Account" in the header.
   */
  isAuthenticated?: boolean
}

export function SiteHeader({ config, basePath = '', isAuthenticated = false }: Props) {
  const { settings, navigation } = config
  const headerCfg = settings.header_config as {
    showLogo?: boolean; showNav?: boolean; transparent?: boolean; sticky?: boolean
    ctaLabel?: string; ctaHref?: string
  } | null

  const isSticky      = headerCfg?.sticky      ?? true
  const isTransparent = headerCfg?.transparent  ?? false
  const showLogo      = headerCfg?.showLogo     ?? true
  const showNav       = headerCfg?.showNav      ?? true
  const ctaLabel      = headerCfg?.ctaLabel
  const ctaHref       = headerCfg?.ctaHref ?? `${basePath}/shop`

  const navItems = navigation.header.filter((n) => n.is_visible)
  const siteName  = settings.site_name || 'Store'
  const logoUrl   = settings.logo_url

  return (
    <header
      style={{
        position:          isSticky ? 'sticky' : 'relative',
        top:               0,
        zIndex:            50,
        background:        isTransparent ? 'transparent' : 'var(--color-surface)',
        borderBottom:      isTransparent ? 'none' : '1px solid var(--color-border)',
        backdropFilter:    isTransparent ? 'blur(12px)' : undefined,
        WebkitBackdropFilter: isTransparent ? 'blur(12px)' : undefined,
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 64, gap: '2rem' }}>

          {/* Logo */}
          {showLogo && (
            <Link href={`${basePath}/`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', flexShrink: 0 }}>
              {logoUrl
                ? <Image src={logoUrl} alt={siteName} width={120} height={32} style={{ height: 32, width: 'auto', objectFit: 'contain' }} unoptimized />
                : <span style={{
                    fontSize: '1.125rem',
                    fontWeight: 700,
                    color: 'var(--color-text)',
                    fontFamily: 'var(--font-heading)',
                  }}>{siteName}</span>
              }
            </Link>
          )}

          {/* Nav */}
          {showNav && navItems.length > 0 && (
            <nav style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flex: 1 }}>
              {navItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  style={{
                    padding: '0.375rem 0.75rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                    color: 'var(--color-muted)',
                    textDecoration: 'none',
                    transition: 'color 0.15s',
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-muted)')}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}

          {/* Spacer */}
          {(!showNav || navItems.length === 0) && <div style={{ flex: 1 }} />}

          {/* Right-side actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            <Link href={`${basePath}/shop`} style={{
              fontSize: '0.875rem',
              color: 'var(--color-muted)',
              textDecoration: 'none',
            }}>
              Shop
            </Link>

            {isAuthenticated ? (
              <Link href={`${basePath}/account`} style={{
                fontSize: '0.875rem',
                color: 'var(--color-muted)',
                textDecoration: 'none',
              }}>
                Account
              </Link>
            ) : (
              <Link href={`${basePath}/login`} style={{
                fontSize:       '0.875rem',
                color:          '#fff',
                background:     'var(--color-primary)',
                padding:        '0.4rem 1rem',
                borderRadius:   '0.625rem',
                textDecoration: 'none',
                fontWeight:     600,
              }}>
                Login
              </Link>
            )}

            {ctaLabel && (
              <Link
                href={ctaHref}
                style={{
                  background:     'var(--color-primary)',
                  color:          '#fff',
                  padding:        '0.5rem 1.25rem',
                  borderRadius:   '0.75rem',
                  fontSize:       '0.875rem',
                  fontWeight:     600,
                  textDecoration: 'none',
                  transition:     'opacity 0.15s',
                }}
              >
                {ctaLabel}
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
