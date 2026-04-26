'use client'
// components/customers/CustomerCard.tsx
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Mail, Phone, CheckCircle2, Circle, ChevronRight } from 'lucide-react'
import type { TenantCustomer } from '@/lib/customers/getTenantCustomers'

interface Props {
  customer:   TenantCustomer
  index?:     number
  canManage?: boolean
}

const STATUS_STYLES: Record<string, string> = {
  active:   'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  inactive: 'text-white/30 bg-white/4 border-white/8',
  banned:   'text-red-400 bg-red-400/10 border-red-400/20',
}

export function CustomerCard({ customer, index = 0, canManage: _canManage }: Props) {
  const initials = customer.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35 }}
    >
      <Link
        href={`/customers/${customer.id}`}
        className="group flex items-center gap-4 p-4 premium-panel premium-border rounded-2xl hover:border-gold-500/30 hover:shadow-glow-gold transition-all duration-200"
      >
        {/* Avatar */}
        <div className="flex-shrink-0 h-11 w-11 rounded-xl bg-gold-gradient flex items-center justify-center shadow-glow-gold/40">
          <span className="text-graphite-900 font-bold text-sm">{initials}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-white text-sm truncate">
              {customer.display_name ?? customer.name}
            </span>
            {customer.has_account && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" aria-label="Has portal account" />
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {customer.email && (
              <span className="flex items-center gap-1 text-xs text-white/40">
                <Mail className="w-3 h-3" />
                {customer.email}
              </span>
            )}
            {customer.phone && (
              <span className="flex items-center gap-1 text-xs text-white/40">
                <Phone className="w-3 h-3" />
                {customer.phone}
              </span>
            )}
          </div>
        </div>

        {/* Status + Arrow */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLES[customer.status] ?? STATUS_STYLES.active}`}>
            {customer.status === 'active'
              ? <CheckCircle2 className="w-3 h-3" />
              : <Circle className="w-3 h-3" />
            }
            {customer.status}
          </span>
          <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-gold-400 transition-colors" />
        </div>
      </Link>
    </motion.div>
  )
}
