// components/site/SiteFooter.tsx
import Link from 'next/link'
import Image from 'next/image'
import type { PublishedSiteConfig } from '@/lib/website/types'

interface Props {
  config: PublishedSiteConfig
}

export function SiteFooter({ config }: Props) {
  const { settings, navigation } = config
  const footerCfg = settings.footer_config as {
    showLogo?: boolean; tagline?: string; copyright?: string; showSocials?: boolean
    socials?: { twitter?: string; instagram?: string; facebook?: string; linkedin?: string }
  } | null

  const showLogo  = footerCfg?.showLogo ?? true
  const tagline   = footerCfg?.tagline
  const copyright = footerCfg?.copyright ?? `© ${new Date().getFullYear()} ${settings.site_name ?? 'Store'}. All rights reserved.`
  const socials   = footerCfg?.socials ?? {}

  const navItems  = navigation.footer.filter((n) => n.is_visible)
  const siteName  = settings.site_name || 'Store'
  const logoUrl   = settings.logo_url

  return (
    <footer style={{
      background:   'var(--color-surface)',
      borderTop:    '1px solid var(--color-border)',
      padding:      '3rem 1.5rem 2rem',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem', marginBottom: '2rem' }}>

          {/* Brand column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {showLogo && (
              <Link href="/" style={{ textDecoration: 'none' }}>
                {logoUrl
                  ? <Image src={logoUrl} alt={siteName} width={100} height={28} style={{ height: 28, width: 'auto', objectFit: 'contain' }} unoptimized />
                  : <span style={{
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: 'var(--color-text)',
                      fontFamily: 'var(--font-heading)',
                    }}>{siteName}</span>
                }
              </Link>
            )}
            {tagline && (
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: 0, lineHeight: 1.6 }}>
                {tagline}
              </p>
            )}
            {/* Socials */}
            {footerCfg?.showSocials && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                {socials.twitter   && <SocialLink href={`https://twitter.com/${socials.twitter}`}   label="Twitter" />}
                {socials.instagram && <SocialLink href={`https://instagram.com/${socials.instagram}`} label="IG" />}
                {socials.facebook  && <SocialLink href={`https://facebook.com/${socials.facebook}`}  label="FB" />}
                {socials.linkedin  && <SocialLink href={`https://linkedin.com/in/${socials.linkedin}`} label="LI" />}
              </div>
            )}
          </div>

          {/* Nav links */}
          {navItems.length > 0 && (
            <div>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                Links
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {navItems.map((item) => (
                  <Link key={item.id} href={item.href} style={{
                    fontSize: '0.875rem',
                    color: 'var(--color-muted)',
                    textDecoration: 'none',
                  }}>
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div style={{
          borderTop:  '1px solid var(--color-border)',
          paddingTop: '1.5rem',
          display:    'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap:   'wrap',
          gap:        '0.5rem',
        }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', margin: 0 }}>
            {copyright}
          </p>
        </div>
      </div>
    </footer>
  )
}

function SocialLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        justifyContent: 'center',
        width:        32,
        height:       32,
        borderRadius: '0.5rem',
        border:       '1px solid var(--color-border)',
        fontSize:     '0.7rem',
        fontWeight:   700,
        color:        'var(--color-muted)',
        textDecoration: 'none',
      }}
    >
      {label}
    </a>
  )
}
