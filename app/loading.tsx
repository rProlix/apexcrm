export default function Loading() {
  return (
    <div className="min-h-dvh bg-graphite-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-gold-gradient animate-pulse" />
        <p className="text-xs text-white/25 uppercase tracking-widest">Loading…</p>
      </div>
    </div>
  )
}
