import { AlertTriangle, CheckCircle2, CircleHelp, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type NoticeTone = 'error' | 'warning' | 'success' | 'info'

const toneStyles: Record<NoticeTone, string> = {
  error: 'border-red-400/20 bg-red-400/[0.07] text-red-100',
  warning: 'border-amber-400/20 bg-amber-400/[0.07] text-amber-100',
  success: 'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-100',
  info: 'border-sky-400/20 bg-sky-400/[0.07] text-sky-100',
}

const toneIcons = {
  error: AlertTriangle,
  warning: CircleHelp,
  success: CheckCircle2,
  info: Info,
} satisfies Record<NoticeTone, typeof Info>

export function InlineNotice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: NoticeTone
  title?: string
  children: ReactNode
  className?: string
}) {
  const Icon = toneIcons[tone]

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
        toneStyles[tone],
        className
      )}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <div className="min-w-0 leading-5">
        {title && <p className="font-semibold">{title}</p>}
        <div className={cn(title && 'mt-0.5 opacity-75')}>{children}</div>
      </div>
    </div>
  )
}
