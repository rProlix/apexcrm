// components/owner/TenantCard.tsx
'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { CheckCircle2, XCircle, Globe, Users, Layers, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TenantSummary } from '@/lib/owner/getTenants'

interface TenantCardProps {
  tenant: TenantSummary
}

export function TenantCard({ tenant }: TenantCardProps) {
  const isActive = tenant.status === 'active'
  const initials = tenant.name.slice(0, 2).toUpperCase()
  const domain   = tenant.custom_domain ?? tenant.subdomain ?? `${tenant.slug}.yourcrm.com`

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18 }}
    >
      <Link
        href={`/owner/tenants/${tenant.id}`}
        className={cn(
          'group block rounded-2xl border bg-graphite-900/70',
          'transition-all duration-200',
          'hover:border-gold-500/30 hover:bg-graphite-900',
          'hover:shadow-[0_0_24px_rgba(201,168,76,0.06)]',
          isActive ? 'border-white/10' : 'border-white/5 opacity-75 hover:opacity-100'
        )}
      >
        {/* Card header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gold-500/20 to-amber-600/10 border border-gold-500/20 flex items-center justify-center shrink-0 transition-colors duration-200 group-hover:border-gold-500/40">
              <span className="text-gold-400 font-bold text-xs group-hover:text-gold-300 transition-colors">
                {initials}
              </span>
            </div>

            <div className="min-w-0">
              <p className="text-sm font-semibold text-white group-hover:text-gold-100 transition-colors truncate">
                {tenant.name}
              </p>
              <p className="text-xs text-white/30 font-mono truncate max-w-[160px]">
                {tenant.slug}
              </p>
            </div>
          </div>

          {/* Status + arrow */}
          <div className="flex items-center gap-2 shrink-0">
            {isActive
              ? <CheckCircle2 className="h-4 w-4 text-emerald-400" strokeWidth={2} />
              : <XCircle      className="h-4 w-4 text-white/20"     strokeWidth={1.75} />
            }
            <ArrowRight
              className="h-4 w-4 text-white/15 group-hover:text-gold-400 group-hover:translate-x-0.5 transition-all duration-150"
              strokeWidth={1.75}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-5 px-5 py-3.5">
          <span className="flex items-center gap-1.5 text-xs text-white/35">
            <Globe className="h-3.5 w-3.5 text-white/20 shrink-0" strokeWidth={1.75} />
            <span className="truncate max-w-[120px] font-mono">{domain}</span>
          </span>

          <span className="flex items-center gap-1.5 text-xs text-white/35 ml-auto shrink-0">
            <Users className="h-3 w-3 text-white/20" strokeWidth={1.75} />
            {tenant.staff_count}
          </span>

          <span className="flex items-center gap-1.5 text-xs shrink-0">
            <Layers className="h-3 w-3 text-white/20" strokeWidth={1.75} />
            <span className={tenant.enabled_modules > 0 ? 'text-emerald-400/80' : 'text-white/30'}>
              {tenant.enabled_modules} modules
            </span>
          </span>
        </div>

        {/* Bottom glow on hover */}
        <div className="h-px bg-gradient-to-r from-transparent via-gold-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </Link>
    </motion.div>
  )
}
