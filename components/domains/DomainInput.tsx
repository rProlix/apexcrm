// components/domains/DomainInput.tsx
'use client'

import { useState, useCallback }  from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'

interface DomainInputProps {
  value:       string
  onChange:    (val: string) => void
  onAdd:       () => void
  loading?:    boolean
  error?:      string | null
  placeholder?: string
  disabled?:   boolean
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i

function normalizeDomainInput(raw: string): string {
  return raw.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .split('/')[0]
    .split('?')[0]
}

export function DomainInput({
  value,
  onChange,
  onAdd,
  loading   = false,
  error     = null,
  placeholder = 'www.yourbusiness.com',
  disabled  = false,
}: DomainInputProps) {
  const [touched, setTouched] = useState(false)

  const normalized = normalizeDomainInput(value)
  const isValid    = normalized.length > 0 && DOMAIN_RE.test(normalized)
  const showError  = touched && normalized.length > 0 && !isValid

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }, [onChange])

  const handleBlur = useCallback(() => setTouched(true), [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValid && !loading) onAdd()
  }, [isValid, loading, onAdd])

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            <Globe className="h-4 w-4 text-zinc-500" />
          </div>
          <input
            type="text"
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || loading}
            className={`w-full rounded-xl border bg-zinc-900/60 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 backdrop-blur-sm transition-all focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              showError || error
                ? 'border-red-500/50 focus:border-red-500/70 focus:ring-red-500/20'
                : isValid && touched
                  ? 'border-emerald-500/50 focus:border-emerald-500/70 focus:ring-emerald-500/20'
                  : 'border-zinc-700/50 focus:border-[#c9a84c]/50 focus:ring-[#c9a84c]/10'
            }`}
          />
          <AnimatePresence>
            {touched && normalized.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute inset-y-0 right-3 flex items-center"
              >
                {isValid
                  ? <CheckCircle className="h-4 w-4 text-emerald-400" />
                  : <AlertCircle className="h-4 w-4 text-red-400"     />
                }
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.button
          type="button"
          onClick={onAdd}
          disabled={!isValid || loading || disabled}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 rounded-xl border border-[#c9a84c]/30 bg-[#c9a84c]/10 px-5 py-3 text-sm font-semibold text-[#c9a84c] transition-all hover:bg-[#c9a84c]/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Add Domain
        </motion.button>
      </div>

      <AnimatePresence>
        {(showError || error) && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0  }}
            exit={{ opacity: 0, y: -4    }}
            className="flex items-center gap-1.5 text-xs text-red-400"
          >
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            {error ?? 'Please enter a valid domain (e.g. www.example.com)'}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
