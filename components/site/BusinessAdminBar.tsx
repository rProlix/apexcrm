'use client'

// components/site/BusinessAdminBar.tsx
//
// A floating admin toolbar shown only to business users (owner/admin/staff)
// when they visit their own business website. Customers never see this.
//
// Features:
//   - Edit Website button
//   - Dashboard link
//   - Appointments / Products / Rewards quick links
//   - "View as Customer" toggle (hides the bar temporarily)
//   - Dismissible within the session

import { useState } from 'react'
import Link from 'next/link'

interface Props {
  /** The user's role — only render for business roles */
  role: 'owner' | 'admin' | 'staff'
  /** Whether this user can edit the website */
  canEdit: boolean
  /** Whether to show the website editor link */
  websiteHref?: string
  /** CRM dashboard href */
  dashboardHref?: string
  /** Tenant subdomain/slug for building links */
  tenantSlug?: string | null
}

export function BusinessAdminBar({ role, canEdit, websiteHref, dashboardHref, tenantSlug }: Props) {
  const [collapsed, setCollapsed]   = useState(false)
  const [dismissed, setDismissed]   = useState(false)

  if (dismissed) return null

  const roleLabel =
    role === 'owner' ? 'Owner'
    : role === 'admin' ? 'Admin'
    : 'Staff'

  const crmBase = dashboardHref ?? '/dashboard'

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Show admin bar"
        style={{
          position:     'fixed',
          top:          '1rem',
          right:        '1rem',
          zIndex:       9999,
          background:   '#1a1a2e',
          color:        '#f0b429',
          border:       'none',
          borderRadius: '50%',
          width:        '2.5rem',
          height:       '2.5rem',
          cursor:       'pointer',
          fontSize:     '1rem',
          boxShadow:    '0 4px 20px rgba(0,0,0,0.4)',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
        }}
      >
        ⚙
      </button>
    )
  }

  return (
    <div
      role="complementary"
      aria-label="Business admin toolbar"
      style={{
        position:        'fixed',
        top:             0,
        left:            0,
        right:           0,
        zIndex:          9999,
        background:      '#1a1a2e',
        color:           '#e2e8f0',
        display:         'flex',
        alignItems:      'center',
        gap:             '0.75rem',
        padding:         '0.5rem 1.25rem',
        fontSize:        '0.8125rem',
        fontFamily:      'system-ui, sans-serif',
        fontWeight:      500,
        borderBottom:    '1px solid rgba(240,180,41,0.15)',
        boxShadow:       '0 2px 16px rgba(0,0,0,0.3)',
        flexWrap:        'wrap',
      }}
    >
      {/* Brand + role badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem' }}>
        <span style={{ color: '#f0b429', fontWeight: 700, fontSize: '0.875rem' }}>Nexora</span>
        <span style={{
          background: 'rgba(240,180,41,0.15)', color: '#f0b429',
          padding: '0.125rem 0.5rem', borderRadius: '999px', fontSize: '0.6875rem',
          fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase',
        }}>
          {roleLabel}
        </span>
      </div>

      {/* Quick links */}
      {canEdit && websiteHref && (
        <Link href={websiteHref} style={linkStyle('#f0b429')}>
          ✏ Edit Website
        </Link>
      )}

      <Link href={`${crmBase}/appointments`} style={linkStyle()}>
        Appointments
      </Link>

      {tenantSlug && (
        <Link href={`${crmBase}/customers`} style={linkStyle()}>
          Customers
        </Link>
      )}

      <Link href={`${crmBase}/rewards`} style={linkStyle()}>
        Rewards
      </Link>

      <Link href={crmBase} style={linkStyle()}>
        CRM Dashboard →
      </Link>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Controls */}
      <button
        onClick={() => setCollapsed(true)}
        title="Minimise admin bar"
        style={controlBtn()}
      >
        Minimise
      </button>
      <button
        onClick={() => setDismissed(true)}
        title="Hide admin bar for this session"
        style={controlBtn()}
      >
        ✕
      </button>
    </div>
  )
}

function linkStyle(color = '#94a3b8'): React.CSSProperties {
  return {
    color,
    textDecoration: 'none',
    padding:        '0.25rem 0.625rem',
    borderRadius:   '0.375rem',
    background:     'rgba(255,255,255,0.05)',
    fontWeight:     600,
    whiteSpace:     'nowrap',
    transition:     'background 0.15s',
  }
}

function controlBtn(): React.CSSProperties {
  return {
    background:   'transparent',
    border:       '1px solid rgba(255,255,255,0.15)',
    color:        '#94a3b8',
    padding:      '0.25rem 0.625rem',
    borderRadius: '0.375rem',
    cursor:       'pointer',
    fontSize:     '0.75rem',
    fontWeight:   600,
  }
}
