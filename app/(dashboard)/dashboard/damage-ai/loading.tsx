export default function DamageAILoading() {
  return (
    <div className="space-y-7" aria-label="Loading inspections" aria-busy="true">
      <div className="h-16 animate-pulse rounded-xl bg-white/[.04]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl border border-white/8 bg-white/[.03]"
          />
        ))}
      </div>
      <div className="h-24 animate-pulse rounded-xl border border-white/8 bg-white/[.03]" />
      <div className="overflow-hidden rounded-xl border border-white/10 bg-graphite-800">
        <div className="h-16 border-b border-white/8 px-5 py-4">
          <div className="h-4 w-40 animate-pulse rounded bg-white/[.08]" />
        </div>
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="grid gap-4 border-b border-white/8 px-5 py-4 sm:grid-cols-[7.5rem_minmax(0,1fr)]"
          >
            <div className="aspect-video animate-pulse rounded-xl bg-white/[.06]" />
            <div className="space-y-3 py-1">
              <div className="h-4 w-1/3 animate-pulse rounded bg-white/[.08]" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-white/[.05]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-white/[.05]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
