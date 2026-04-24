// components/domains/SubdomainDisplay.tsx
'use client'

import { useState }               from 'react'
import { motion }                 from 'framer-motion'
import { Globe, Copy, Check, ExternalLink } from 'lucide-react'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'yourcrm.com'

interface SubdomainDisplayProps {
  slug:    string
  label?:  string
  showLink?: boolean
}

export function SubdomainDisplay({ slug, label, showLink = true }: SubdomainDisplayProps) {
  const [copied, setCopied] = useState(false)

  const url = `https://${slug}.${ROOT_DOMAIN}`

  const copy = () => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-sky-500/15">
            <Globe className="h-4 w-4 text-sky-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-500">
              {label ?? 'Platform Subdomain (Free)'}
            </p>
            <p className="truncate font-mono text-sm font-semibold text-sky-300">
              {url}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {showLink && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-700/50 hover:text-zinc-300"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <motion.button
            type="button"
            onClick={copy}
            whileTap={{ scale: 0.9 }}
            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-700/50 hover:text-zinc-300"
          >
            {copied
              ? <Check className="h-3.5 w-3.5 text-emerald-400" />
              : <Copy  className="h-3.5 w-3.5" />
            }
          </motion.button>
        </div>
      </div>

      <p className="mt-2 text-xs text-zinc-600">
        Always available — no setup required. Your business is permanently accessible at this URL.
      </p>
    </div>
  )
}
