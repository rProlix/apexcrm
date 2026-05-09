'use client'
// components/settings/EmailSettingsClient.tsx
// Email system settings panel — provider status, test sender, recent logs.

import { useState, useCallback } from 'react'
import {
  Mail, CheckCircle2, XCircle, Send, RefreshCw, AlertCircle,
  Zap, Activity, Clock, ChevronDown, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProviderStatus {
  provider:             string
  fromAddress:          string
  replyTo:              string
  transactionalEnabled: boolean
  marketingEnabled:     boolean
  resendConfigured:     boolean
  sesConfigured:        boolean
}

interface EmailLog {
  id:            string
  category:      string
  to_email:      string
  subject:       string
  status:        string
  provider:      string
  message_id:    string | null
  error_message: string | null
  created_at:    string
}

interface ConfigValidation {
  ok:       boolean
  provider: string
  missing:  string[]
  warnings: string[]
}

interface Props {
  status:           ProviderStatus
  validation:       ConfigValidation
  recentLogs:       unknown[]
  defaultTestEmail: string
  userRole:         string
}


function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border',
      ok
        ? 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400'
        : 'bg-red-400/10 border-red-400/20 text-red-400'
    )}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </span>
  )
}

const LOG_STATUS_COLORS: Record<string, string> = {
  sent:    'text-emerald-400',
  failed:  'text-red-400',
  blocked: 'text-amber-400',
}

export function EmailSettingsClient({ status, validation, recentLogs, defaultTestEmail, userRole }: Props) {
  const [testEmail,    setTestEmail]    = useState(defaultTestEmail)
  const [sending,      setSending]      = useState(false)
  const [testResult,   setTestResult]   = useState<{ success: boolean; provider?: string; messageId?: string; error?: string; hints?: { missing: string[]; warnings: string[] } } | null>(null)
  const [showLogs,     setShowLogs]     = useState(true)

  const handleSendTest = useCallback(async () => {
    if (!testEmail.trim()) return
    setSending(true)
    setTestResult(null)
    try {
      // Use debug endpoint which also returns config hints on failure
      const res  = await fetch('/api/debug/email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ to: testEmail }),
      })
      const data = await res.json()
      setTestResult(data)
    } catch {
      setTestResult({ success: false, error: 'Network error — check browser console.' })
    } finally {
      setSending(false)
    }
  }, [testEmail])

  const activeProvider = status.provider === 'ses'
    ? (status.sesConfigured ? 'Amazon SES' : 'Amazon SES (not configured)')
    : (status.resendConfigured ? 'Resend' : 'Resend (not configured)')

  const isConfigured = status.provider === 'ses' ? status.sesConfigured : status.resendConfigured

  const logs = (recentLogs as EmailLog[])

  return (
    <div className="space-y-8 max-w-3xl">

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
          <Mail className="h-5 w-5 text-blue-400" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Email Settings</h1>
          <p className="text-sm text-white/40 mt-0.5">
            Provider configuration and delivery health.
            Provider secrets are managed via Vercel environment variables.
          </p>
        </div>
      </div>

      {/* Config health — show prominently when misconfigured */}
      {(!validation.ok || validation.warnings.length > 0) && (
        <div className={cn(
          'rounded-2xl border p-5 space-y-3',
          !validation.ok
            ? 'bg-red-400/6 border-red-400/20'
            : 'bg-amber-400/6 border-amber-400/20'
        )}>
          <div className="flex items-center gap-2">
            <AlertCircle className={cn('w-4 h-4', !validation.ok ? 'text-red-400' : 'text-amber-400')} />
            <span className={cn('text-sm font-semibold', !validation.ok ? 'text-red-300' : 'text-amber-300')}>
              {!validation.ok ? 'Email configuration is incomplete' : 'Email configuration warnings'}
            </span>
          </div>
          {validation.missing.map((m, i) => (
            <p key={i} className="text-xs text-red-300/80 leading-relaxed">
              <span className="font-semibold">Missing:</span> {m}
            </p>
          ))}
          {validation.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-300/80 leading-relaxed">
              <span className="font-semibold">Warning:</span> {w}
            </p>
          ))}
          <p className="text-xs text-white/30 pt-1">
            Set these in <strong>Vercel → Project → Settings → Environment Variables</strong>, then redeploy.
          </p>
        </div>
      )}

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Active provider */}
        <div className="rounded-2xl border border-surface-border bg-graphite-900/60 p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4 text-gold-400" />
            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Active provider</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-white">{activeProvider}</span>
            <StatusBadge ok={isConfigured} label={isConfigured ? 'Configured' : 'Missing config'} />
          </div>
          <p className="text-xs text-white/30">
            Change via <code className="font-mono bg-white/6 px-1.5 py-0.5 rounded">EMAIL_PROVIDER</code> env var.
          </p>
        </div>

        {/* Sending config */}
        <div className="rounded-2xl border border-surface-border bg-graphite-900/60 p-5 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="h-4 w-4 text-white/40" />
            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Sender config</span>
          </div>
          <div className="space-y-1.5">
            {[
              { label: 'From',     value: status.fromAddress },
              { label: 'Reply-to', value: status.replyTo },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-white/30 w-16">{label}</span>
                <span className="text-xs text-white/70 font-mono">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Transactional */}
        <div className="rounded-2xl border border-surface-border bg-graphite-900/60 p-5 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="h-4 w-4 text-white/40" />
            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Delivery</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/70">Transactional emails</span>
              <StatusBadge ok={status.transactionalEnabled} label={status.transactionalEnabled ? 'Enabled' : 'Disabled'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/70">Marketing emails</span>
              <StatusBadge ok={status.marketingEnabled} label={status.marketingEnabled ? 'Enabled' : 'Disabled'} />
            </div>
          </div>
        </div>

        {/* Provider availability */}
        <div className="rounded-2xl border border-surface-border bg-graphite-900/60 p-5 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-white/40" />
            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Providers</span>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Resend',      ok: status.resendConfigured },
              { label: 'Amazon SES',  ok: status.sesConfigured },
            ].map(({ label, ok }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-white/70">{label}</span>
                <StatusBadge ok={ok} label={ok ? 'Configured' : 'Not configured'} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Test email sender */}
      {['owner', 'admin'].includes(userRole) && (
        <div className="rounded-2xl border border-surface-border bg-graphite-900/60 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-gold-500/8 border border-gold-500/15 flex items-center justify-center">
              <Send className="h-4 w-4 text-gold-400" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Send test email</h2>
              <p className="text-xs text-white/35">Verify your provider is working correctly</p>
            </div>
          </div>

            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Recipient email</label>
              <input
                type="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                className="w-full h-10 px-3 rounded-xl bg-white/4 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-gold-500/50"
              />
            </div>

          {testResult && (
            <div className={cn(
              'rounded-xl p-3.5 space-y-2',
              testResult.success
                ? 'bg-emerald-400/8 border border-emerald-400/20'
                : 'bg-red-400/8 border border-red-400/20'
            )}>
              <div className="flex items-start gap-2">
                {testResult.success
                  ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                  : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
                }
                <p className={cn('text-sm', testResult.success ? 'text-emerald-300' : 'text-red-300')}>
                  {testResult.success
                    ? <>Test email sent via <strong>{testResult.provider}</strong>{testResult.messageId ? <> · <code className="font-mono text-xs">{testResult.messageId}</code></> : null}</>
                    : <>{testResult.error ?? 'Send failed'}</>
                  }
                </p>
              </div>
              {/* Show config hints when send fails */}
              {!testResult.success && testResult.hints && (
                <div className="ml-6 space-y-1.5">
                  {(testResult.hints.missing as string[]).map((m: string, i: number) => (
                    <p key={i} className="text-xs text-red-300/70">Missing: {m}</p>
                  ))}
                  {(testResult.hints.warnings as string[]).map((w: string, i: number) => (
                    <p key={i} className="text-xs text-amber-300/70">{w}</p>
                  ))}
                  <a
                    href="https://resend.com/domains"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400/80 hover:text-blue-300 underline"
                  >
                    <ExternalLink className="w-3 h-3" /> Manage domains in Resend
                  </a>
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleSendTest}
            disabled={sending || !testEmail.trim()}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-semibold bg-gold-gradient text-graphite-900 hover:shadow-glow-gold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {sending
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</>
              : <><Send className="w-4 h-4" /> Send test email</>
            }
          </button>

          <div className="rounded-xl bg-white/3 border border-white/6 p-3">
            <p className="text-xs text-white/30 leading-relaxed">
              Provider secrets are managed via Vercel environment variables and cannot be edited here.
              Set <code className="font-mono bg-white/8 px-1 rounded">EMAIL_PROVIDER</code>,{' '}
              <code className="font-mono bg-white/8 px-1 rounded">RESEND_API_KEY</code>, or{' '}
              <code className="font-mono bg-white/8 px-1 rounded">AWS_SES_*</code> in Vercel to switch providers.
            </p>
          </div>
        </div>
      )}

      {/* Recent email logs */}
      <div className="rounded-2xl border border-surface-border bg-graphite-900/60 p-6 space-y-4">
        <button
          onClick={() => setShowLogs(v => !v)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-white/4 border border-white/8 flex items-center justify-center">
              <Clock className="h-4 w-4 text-white/40" strokeWidth={1.75} />
            </div>
            <div className="text-left">
              <h2 className="text-sm font-bold text-white">Recent email logs</h2>
              <p className="text-xs text-white/35">Last {logs.length} emails sent</p>
            </div>
          </div>
          <ChevronDown className={cn('w-4 h-4 text-white/30 transition-transform', showLogs ? 'rotate-180' : '')} />
        </button>

        {showLogs && (
          logs.length === 0
            ? <p className="text-sm text-white/30 text-center py-6">No email logs yet. Run the migration and send a test email.</p>
            : (
              <div className="space-y-1.5 mt-1">
                {logs.map(log => (
                  <div key={log.id} className="flex items-start gap-3 rounded-xl bg-white/3 border border-white/6 p-3">
                    <div className={cn('mt-0.5 w-2 h-2 rounded-full shrink-0', {
                      'bg-emerald-400': log.status === 'sent',
                      'bg-red-400':    log.status === 'failed',
                      'bg-amber-400':  log.status === 'blocked',
                    })} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-white/70 truncate">{log.to_email}</span>
                        <span className={cn('text-xs font-medium', LOG_STATUS_COLORS[log.status] ?? 'text-white/30')}>
                          {log.status}
                        </span>
                        <span className="text-xs text-white/25">{log.provider}</span>
                        <span className="text-xs text-white/20 bg-white/4 px-1.5 rounded-full">{log.category}</span>
                      </div>
                      <p className="text-xs text-white/40 truncate mt-0.5">{log.subject}</p>
                      {log.error_message && (
                        <p className="text-xs text-red-400/70 mt-0.5 truncate">{log.error_message}</p>
                      )}
                    </div>
                    <span className="text-xs text-white/20 shrink-0 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )
        )}
      </div>
    </div>
  )
}
