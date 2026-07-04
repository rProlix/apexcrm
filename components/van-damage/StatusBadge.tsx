const styles: Record<string, string> = {
  queued: 'bg-sky-400/10 text-sky-300 border-sky-400/20',
  processing: 'bg-violet-400/10 text-violet-300 border-violet-400/20',
  analyzing: 'bg-fuchsia-400/10 text-fuchsia-300 border-fuchsia-400/20',
  completed: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
  failed: 'bg-red-400/10 text-red-300 border-red-400/20',
  needs_review: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${styles[status] ?? 'bg-white/5 text-white/60 border-white/10'}`}>
      {status.replaceAll('_', ' ')}
    </span>
  )
}
