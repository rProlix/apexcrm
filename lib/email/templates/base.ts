// lib/email/templates/base.ts
// Shared base HTML wrapper for all Nexora transactional emails.
// Compatible with Gmail, Outlook, Apple Mail, and mobile clients.
//
// WHITE-LABEL RULES:
//   - tenant mode  → business logo/name in header; business-only footer; no Nexora logo
//   - platform mode → Nexora "N" badge and footer
//   - "Sent via Nexora on behalf of..." is NEVER shown in tenant emails

export interface BaseEmailOptions {
  title:        string
  previewText:  string
  bodyHtml:     string
  ctaLabel?:    string
  ctaUrl?:      string

  // Branding (tenant mode when tenantName is set)
  tenantName?:        string | null   // Business display name
  tenantLogoUrl?:     string | null   // Business logo image URL
  tenantWebsiteUrl?:  string | null   // Business public website
  tenantPrimaryColor?: string | null  // Hex color for CTA button (e.g. "#16a34a")
  tenantReplyTo?:     string | null   // Business support email

  // Platform override  
  showPoweredBy?: boolean             // Show "Powered by Nexora" in tenant footer
  footerText?:    string              // Extra footer line (unsubscribe link, etc.)
}

// ── Helper: sanitize hex color ────────────────────────────────────────────────

function safeColor(hex: string | null | undefined, fallback: string): string {
  if (!hex) return fallback
  return /^#[0-9a-fA-F]{3,8}$/.test(hex) ? hex : fallback
}

// ── Helper: first letter badge ────────────────────────────────────────────────

function initialBadge(name: string, color: string): string {
  const letter = (name.trim()[0] ?? '?').toUpperCase()
  return `
    <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:14px;background:${color};margin-bottom:12px;">
      <span style="color:#ffffff;font-weight:900;font-size:22px;font-family:Arial,sans-serif;line-height:1;">${letter}</span>
    </div>`
}

// ── Helper: logo block (img or fallback badge) ────────────────────────────────

function logoBlock(name: string, logoUrl: string | null | undefined, color: string): string {
  if (logoUrl) {
    return `
    <div style="margin-bottom:12px;">
      <img src="${logoUrl}" alt="${name}" style="max-height:52px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />
    </div>`
  }
  return initialBadge(name, color)
}

// ── Helper: Nexora "N" badge ──────────────────────────────────────────────────

const NEXORA_BADGE = `
  <div style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#d97706);margin-bottom:12px;">
    <span style="color:#111827;font-weight:900;font-size:18px;font-family:Arial,sans-serif;">N</span>
  </div>`

// ── CTA button builder ────────────────────────────────────────────────────────

function buildCtaBlock(ctaLabel: string, ctaUrl: string, ctaColor: string): string {
  const textColor = ctaColor === '#111827' ? '#ffffff' : '#111827'
  // Use white text for dark colors, dark text for light colors
  const isDark = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.test(ctaColor)
    ? parseInt(ctaColor.slice(1, 3), 16) * 0.299 +
      parseInt(ctaColor.slice(3, 5), 16) * 0.587 +
      parseInt(ctaColor.slice(5, 7), 16) * 0.114 < 128
    : false

  const fgColor = isDark ? '#ffffff' : '#111827'

  const ctaStyle = [
    'display:inline-block',
    'padding:14px 36px',
    `background:${ctaColor}`,
    `color:${fgColor}`,
    'font-size:15px',
    'font-weight:700',
    'text-decoration:none',
    'border-radius:10px',
    'letter-spacing:0.01em',
    'mso-padding-alt:14px 36px',
  ].join(';')

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;">
      <tr>
        <td align="center">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
            href="${ctaUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="20%"
            fillcolor="${ctaColor}" strokecolor="${ctaColor}">
            <w:anchorlock/>
            <center style="color:${fgColor};font-family:sans-serif;font-size:15px;font-weight:700;">
              ${ctaLabel}
            </center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <a href="${ctaUrl}" target="_blank" style="${ctaStyle}">
            ${ctaLabel}
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>
    <p style="color:#6b7280;font-size:12px;text-align:center;margin:0 0 24px;">
      Or copy this link: <a href="${ctaUrl}" style="color:#3b82f6;word-break:break-all;">${ctaUrl}</a>
    </p>`
}

// ── Main render function ──────────────────────────────────────────────────────

export function renderBaseEmail(opts: BaseEmailOptions): string {
  const {
    title,
    previewText,
    bodyHtml,
    ctaLabel,
    ctaUrl,
    tenantName,
    tenantLogoUrl,
    tenantWebsiteUrl,
    tenantPrimaryColor,
    showPoweredBy = false,
    footerText,
  } = opts

  const isTenantMode  = Boolean(tenantName)
  const primaryColor  = safeColor(tenantPrimaryColor, '#f59e0b')

  // ── Header ──
  const headerBg = isTenantMode
    ? 'background:#111827;'
    : 'background:linear-gradient(135deg,#111827 0%,#1f2937 100%);'

  const headerContent = isTenantMode
    ? `${logoBlock(tenantName!, tenantLogoUrl, primaryColor)}
       <p style="color:#ffffff;font-size:17px;font-weight:700;margin:0;letter-spacing:-0.01em;">${tenantName}</p>`
    : `${NEXORA_BADGE}
       <p style="color:#ffffff;font-size:17px;font-weight:700;margin:0;letter-spacing:-0.01em;">Nexora</p>`

  // ── CTA ──
  const ctaBlock = ctaLabel && ctaUrl
    ? buildCtaBlock(ctaLabel, ctaUrl, primaryColor)
    : ''

  // ── Footer ──
  let footerHtml: string
  if (isTenantMode) {
    const parts: string[] = []
    if (tenantWebsiteUrl) {
      parts.push(`<a href="${tenantWebsiteUrl}" style="color:#9ca3af;text-decoration:none;">${tenantName}</a>`)
    } else {
      parts.push(`<span>${tenantName}</span>`)
    }
    if (footerText) parts.push(footerText)
    if (showPoweredBy) parts.push('<span style="opacity:0.5;">Powered by Nexora</span>')
    footerHtml = parts.join(' &middot; ')
  } else {
    const parts = ['Nexora · Smarter Business Management']
    if (footerText) parts.push(footerText)
    footerHtml = parts.join(' &middot; ')
  }

  return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${title}</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <style>
    body,table,td{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    img{border:0;height:auto;line-height:100%;outline:none;text-decoration:none}
    @media only screen and (max-width:600px){
      .email-container{width:100%!important}
      .inner-pad{padding:28px 20px!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <!-- Preview text (hidden) -->
  <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f3f4f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table class="email-container" width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);border:1px solid #e5e7eb;">

          <!-- Header -->
          <tr>
            <td style="${headerBg}padding:28px 40px;text-align:center;">
              ${headerContent}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="inner-pad" style="padding:40px;">
              ${bodyHtml}
              ${ctaBlock}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.8;">
                ${footerHtml}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim()
}

// ── Plain-text version ────────────────────────────────────────────────────────

export function renderBasePlainText(opts: {
  bodyText:           string
  ctaLabel?:          string
  ctaUrl?:            string
  tenantName?:        string | null
  tenantWebsiteUrl?:  string | null
  footerText?:        string
  showPoweredBy?:     boolean
}): string {
  const lines: string[] = [opts.bodyText.trim()]

  if (opts.ctaLabel && opts.ctaUrl) {
    lines.push('', `${opts.ctaLabel}: ${opts.ctaUrl}`)
  }

  lines.push('', '---')

  if (opts.tenantName) {
    // Tenant mode — no "Sent via Nexora"
    const footer: string[] = [opts.tenantName]
    if (opts.tenantWebsiteUrl) footer.push(opts.tenantWebsiteUrl)
    if (opts.footerText)       footer.push(opts.footerText)
    if (opts.showPoweredBy)    footer.push('Powered by Nexora')
    lines.push(footer.join(' · '))
  } else {
    // Platform mode
    lines.push('Nexora · Smarter Business Management')
    if (opts.footerText) lines.push(opts.footerText)
  }

  return lines.join('\n')
}
