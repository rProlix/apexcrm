export default function DashboardLoading() {
  return (
    <div className="pl-60 pt-14 min-h-dvh bg-graphite-950">
      <div className="max-w-screen-2xl mx-auto px-6 py-8 space-y-8">
        {/* Header skeleton */}
        <div className="h-8 w-48 bg-graphite-800 rounded-xl animate-pulse" />

        {/* KPI row skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-graphite-800 animate-pulse" />
          ))}
        </div>

        {/* Module grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-44 rounded-2xl bg-graphite-800 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}
