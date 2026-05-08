// lib/email/sendEmail.ts
// Lightweight email sender using the Resend API via fetch.
// No SDK dependency — just a plain HTTP POST.
//
// Required env vars:
//   RESEND_API_KEY  — Resend secret key (required to send email)
//   EMAIL_FROM      — Sender address, e.g. "ApexCRM <noreply@nexoranow.com>"

export interface SendEmailOptions {
  to:      string | string[]
  subject: string
  html:    string
  text?:   string
  from?:   string
  replyTo?: string
}

export interface SendEmailResult {
  ok:    boolean
  id?:   string
  error?: string
  code?:  string
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from   = opts.from ?? process.env.EMAIL_FROM

  if (!apiKey) {
    console.error('[sendEmail] RESEND_API_KEY is not set')
    return { ok: false, code: 'EMAIL_NOT_CONFIGURED', error: 'Email sending is not configured (RESEND_API_KEY missing).' }
  }

  if (!from) {
    console.error('[sendEmail] EMAIL_FROM is not set')
    return { ok: false, code: 'EMAIL_NOT_CONFIGURED', error: 'Email sending is not configured (EMAIL_FROM missing).' }
  }

  const to = Array.isArray(opts.to) ? opts.to : [opts.to]

  const body: Record<string, unknown> = {
    from,
    to,
    subject: opts.subject,
    html:    opts.html,
  }
  if (opts.text)    body.text     = opts.text
  if (opts.replyTo) body.reply_to = opts.replyTo

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      const msg = (data as { message?: string }).message ?? `HTTP ${res.status}`
      console.error('[sendEmail] Resend error:', msg, data)
      return { ok: false, code: 'EMAIL_SEND_FAILED', error: msg }
    }

    return { ok: true, id: (data as { id?: string }).id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[sendEmail] Fetch error:', msg)
    return { ok: false, code: 'EMAIL_SEND_FAILED', error: msg }
  }
}
