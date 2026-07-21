export default function VehiclesLoading() {
  return (
    <div className="space-y-8 p-6" aria-label="Loading Fleet">
      <div className="h-16 animate-pulse rounded-xl bg-white/[.04]" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl bg-white/[.04]" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-white/[.04]" />
    </div>
  )
}
