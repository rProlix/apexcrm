'use client'
// components/website-ai/AiAutofillSecurityNotice.tsx

import { ShieldAlert } from 'lucide-react'

export function AiAutofillSecurityNotice() {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-graphite-800/60 border border-white/8 px-4 py-3">
      <ShieldAlert className="h-4 w-4 text-gold-400 shrink-0 mt-0.5" strokeWidth={1.75} />
      <p className="text-xs text-white/50 leading-relaxed">
        <span className="font-semibold text-white/70">Privacy reminder — </span>
        only paste information you are allowed to publish. Do not paste passwords, API keys,
        payment details, or private customer records.
      </p>
    </div>
  )
}
