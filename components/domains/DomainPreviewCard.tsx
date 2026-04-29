// components/domains/DomainPreviewCard.tsx
'use client'

import { motion }       from 'framer-motion'
import { ExternalLink, Globe, LayoutDashboard, Users, ShoppingBag } from 'lucide-react'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

interface DomainPreviewCardProps {
  slug:         string
  customDomain?: string | null
  isVerified?:  boolean
}

interface UrlEntry {
  icon:  React.ReactNode
  label: string
  url:   string
  badge?: string
}

export function DomainPreviewCard({ slug, customDomain, isVerified = false }: DomainPreviewCardProps) {
  const subdomainBase = `https://${slug}.${ROOT_DOMAIN}`
  const activeBase    = customDomain && isVerified ? `https://${customDomain}` : subdomainBase

  const urls: UrlEntry[] = [
    {
      icon:  <Globe           className="h-4 w-4" />,
      label: 'Public Website',
      url:   `${activeBase}/`,
      badge: customDomain && isVerified ? 'Custom' : 'Subdomain',
    },
    {
      icon:  <LayoutDashboard className="h-4 w-4" />,
      label: 'CRM Dashboard',
      url:   `${activeBase}/dashboard`,
    },
    {
      icon:  <Users           className="h-4 w-4" />,
      label: 'Customer Portal',
      url:   `${activeBase}/portal`,
    },
    {
      icon:  <ShoppingBag     className="h-4 w-4" />,
      label: 'Online Store',
      url:   `${activeBase}/store`,
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-zinc-700/50 bg-zinc-900/60 p-5 backdrop-blur-sm"
    >
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-200">
        <Globe className="h-4 w-4 text-[#c9a84c]" />
        Live URLs
      </h3>

      <div className="space-y-2">
        {urls.map((entry) => (
          <a
            key={entry.url}
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between rounded-xl border border-zinc-800/50 bg-zinc-800/20 px-4 py-3 transition-all hover:border-zinc-700/70 hover:bg-zinc-800/40"
          >
            <div className="flex items-center gap-3">
              <span className="text-zinc-500 group-hover:text-[#c9a84c] transition-colors">
                {entry.icon}
              </span>
              <div>
                <p className="text-xs font-medium text-zinc-300">{entry.label}</p>
                <p className="font-mono text-xs text-zinc-600 truncate max-w-[200px]">
                  {entry.url}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {entry.badge && (
                <span className="rounded-full bg-zinc-700/50 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                  {entry.badge}
                </span>
              )}
              <ExternalLink className="h-3.5 w-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            </div>
          </a>
        ))}
      </div>

      {customDomain && !isVerified && (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <p className="text-xs text-amber-400/80">
            Custom domain added but not yet verified. URLs above use the platform subdomain until verification is complete.
          </p>
        </div>
      )}
    </motion.div>
  )
}
