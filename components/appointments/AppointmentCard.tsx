// components/appointments/AppointmentCard.tsx
'use client'

import { motion } from 'framer-motion'
import { Clock, MapPin, User } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import type { Appointment } from '@/lib/appointments/types'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function durationLabel(starts_at: string, ends_at: string) {
  const mins = Math.round((new Date(ends_at).getTime() - new Date(starts_at).getTime()) / 60_000)
  if (mins < 60)  return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

interface Props {
  appointment: Appointment
  compact?:    boolean
  onClick?:    (appt: Appointment) => void
}

export function AppointmentCard({ appointment: appt, compact = false, onClick }: Props) {
  const isActive = appt.status === 'confirmed' || appt.status === 'pending'

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01, boxShadow: '0 0 20px rgba(201,168,76,0.12)' }}
      transition={{ duration: 0.2 }}
      onClick={() => onClick?.(appt)}
      className={`
        group relative rounded-xl border cursor-pointer select-none transition-colors duration-200
        ${isActive
          ? 'bg-graphite-700/60 border-gold-500/20 hover:border-gold-500/40'
          : 'bg-graphite-800/60 border-surface-border hover:border-white/10'
        }
        ${compact ? 'p-2' : 'p-4'}
      `}
    >
      {/* Gold accent strip for active appointments */}
      {isActive && (
        <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-gold-gradient opacity-70" />
      )}

      {compact ? (
        <div className={`${isActive ? 'pl-2' : ''}`}>
          <p className="text-xs font-semibold text-white truncate leading-tight">{appt.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-2xs text-white/40">{formatTime(appt.starts_at)}</p>
            {appt.professional && (
              <p className="text-2xs text-gold-400/70 truncate">· {appt.professional.name}</p>
            )}
          </div>
        </div>
      ) : (
        <div className={`${isActive ? 'pl-3' : ''}`}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <h3 className="text-sm font-semibold text-white leading-snug flex-1 line-clamp-1">
              {appt.title}
            </h3>
            <StatusBadge status={appt.status} />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(appt.starts_at)} · {durationLabel(appt.starts_at, appt.ends_at)}
            </span>

            {/* Professional / employee */}
            {appt.professional && (
              <span className="flex items-center gap-1 text-gold-400/70">
                <User className="w-3 h-3" />
                {appt.professional.name}
              </span>
            )}

            {/* Customer (shown if no professional, or in addition) */}
            {appt.customer && !appt.professional && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {appt.customer.name}
              </span>
            )}

            {appt.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {appt.location}
              </span>
            )}
          </div>

          {appt.description && (
            <p className="mt-2 text-xs text-white/35 line-clamp-2 leading-relaxed">
              {appt.description}
            </p>
          )}
        </div>
      )}
    </motion.div>
  )
}
