// lib/email/templates/base.ts
// Shared base HTML wrapper for all Nexora transactional emails.
// Compatible with Gmail, Outlook, Apple Mail, and mobile clients.

export interface BaseEmailOptions {
  title:        string
  previewText:  string
  bodyHtml:     string
  ctaLabel?:    string
  ctaUrl?:      string
  footerText?:  string
  tenantName?:  string
}

/** Gold CTA button style used across all templates */
const CTA_STYLE = [
  'display:inline-block',
  'padding:14px 36px',
  'background:linear-gradient(135deg,#f59e0b,#d97706)',
  'color:#111827',
  'font-size:15px',
  'font-weight:700',
  'text-decoration:none',
  'border-radius:10px',
  'letter-spacing:0.01em',
  'mso-padding-alt:14px 36px',
].join(';')

export function renderBaseEmail(opts: BaseEmailOptions): string {
  const {
    title,
    previewText,
    bodyHtml,
    ctaLabel,
    ctaUrl,
    footerText,
    tenantName,
  } = opts

  const ctaBlock =
    ctaLabel && ctaUrl
      ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;">
          <tr>
            <td align="center">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                href="${ctaUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="20%"
                fillcolor="#f59e0b" strokecolor="#d97706">
                <w:anchorlock/>
                <center style="color:#111827;font-family:sans-serif;font-size:15px;font-weight:700;">
                  ${ctaLabel}
                </center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <a href="${ctaUrl}" target="_blank" style="${CTA_STYLE}">
                ${ctaLabel}
              </a>
              <!--<![endif]-->
            </td>
          </tr>
        </table>
        <p style="color:#6b7280;font-size:12px;text-align:center;margin:0 0 24px;">
          Or copy this link: <a href="${ctaUrl}" style="color:#3b82f6;word-break:break-all;">${ctaUrl}</a>
        </p>`
      : ''

  const footer = [
    tenantName ? `Sent via Nexora on behalf of ${tenantName}` : 'Nexora · Smarter Business Management',
    footerText ?? '',
  ]
    .filter(Boolean)
    .join(' &middot; ')

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
            <td style="background:linear-gradient(135deg,#111827 0%,#1f2937 100%);padding:28px 40px;text-align:center;">
              <div style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#d97706);margin-bottom:12px;">
                <span style="color:#111827;font-weight:900;font-size:18px;font-family:Arial,sans-serif;">N</span>
              </div>
              <p style="color:#ffffff;font-size:17px;font-weight:700;margin:0;letter-spacing:-0.01em;">Nexora</p>
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
              <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
                ${footer}
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

/** Plain-text version wrapper */
export function renderBasePlainText(opts: {
  bodyText:    string
  ctaLabel?:   string
  ctaUrl?:     string
  footerText?: string
  tenantName?: string
}): string {
  const lines: string[] = [opts.bodyText.trim()]
  if (opts.ctaLabel && opts.ctaUrl) {
    lines.push('', `${opts.ctaLabel}: ${opts.ctaUrl}`)
  }
  lines.push(
    '',
    '---',
    opts.tenantName
      ? `Sent via Nexora on behalf of ${opts.tenantName}`
      : 'Nexora · Smarter Business Management',
  )
  if (opts.footerText) lines.push(opts.footerText)
  return lines.join('\n')
}
