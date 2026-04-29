// components/domains/DomainDnsInstructions.tsx
'use client'

import { useState }               from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, ChevronDown, Info } from 'lucide-react'

interface DnsRecord {
  type:  string
  host:  string
  value: string
  ttl:   string
}

interface DomainDnsInstructionsProps {
  domain:             string
  verificationToken?: string
  expanded?:          boolean
}

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copy}
      className="ml-2 flex-shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700/50 hover:text-zinc-300"
    >
      {copied
        ? <Check className="h-3.5 w-3.5 text-emerald-400" />
        : <Copy  className="h-3.5 w-3.5" />
      }
    </button>
  )
}

function RecordRow({ record }: { record: DnsRecord }) {
  return (
    <div className="grid grid-cols-[80px_1fr_1fr_60px] gap-2 items-center py-2.5 border-b border-zinc-800/50 last:border-0">
      <span className="rounded bg-zinc-800 px-2 py-0.5 text-center text-[11px] font-mono font-bold text-zinc-300">
        {record.type}
      </span>
      <div className="flex items-center min-w-0">
        <span className="truncate font-mono text-xs text-zinc-400">{record.host}</span>
        <CopyButton text={record.host} />
      </div>
      <div className="flex items-center min-w-0">
        <span className="truncate font-mono text-xs text-[#c9a84c]">{record.value}</span>
        <CopyButton text={record.value} />
      </div>
      <span className="text-center text-xs text-zinc-600">{record.ttl}s</span>
    </div>
  )
}

export function DomainDnsInstructions({
  domain,
  verificationToken,
  expanded: defaultExpanded = false,
}: DomainDnsInstructionsProps) {
  const [open, setOpen] = useState(defaultExpanded)

  const isApex = !domain.startsWith('www.')

  const records: DnsRecord[] = [
    ...(verificationToken
      ? [{
          type:  'TXT',
          host:  `_yourcrm-verify.${domain}`,
          value: `yourcrm-verify=${verificationToken}`,
          ttl:   '300',
        }]
      : []),
    isApex
      ? { type: 'A',     host: '@',         value: '76.76.21.21',     ttl: '300' }
      : { type: 'CNAME', host: domain,       value: `cname.${ROOT_DOMAIN}`, ttl: '300' },
    { type: 'CNAME', host: `www.${domain}`, value: `cname.${ROOT_DOMAIN}`, ttl: '300' },
  ]

  return (
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/40 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-zinc-800/30"
      >
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-[#c9a84c]" />
          <span className="text-sm font-medium text-zinc-200">DNS Configuration Instructions</span>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-800/50 px-4 pb-4 pt-3">
              <p className="mb-3 text-xs text-zinc-500">
                Add the following DNS records at your domain registrar. Changes may take up to 48 hours to propagate.
              </p>

              {/* Header row */}
              <div className="grid grid-cols-[80px_1fr_1fr_60px] gap-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                <span>Type</span>
                <span>Host</span>
                <span>Value</span>
                <span className="text-center">TTL</span>
              </div>

              {records.map((r, i) => (
                <RecordRow key={i} record={r} />
              ))}

              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <p className="text-xs text-amber-400/80">
                  After adding DNS records, click <strong>Verify Domain</strong> to confirm ownership. The TXT record is required for verification.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
