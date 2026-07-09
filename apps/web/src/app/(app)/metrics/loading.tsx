export default function MetricsLoading() {
  return (
    <div className="space-y-6 max-w-5xl animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded-md" style={{ backgroundColor: 'var(--color-neutral-200)' }} />
          <div className="h-4 w-72 rounded-md" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
        </div>
        <div className="h-10 w-40 rounded-md" style={{ backgroundColor: 'var(--color-neutral-200)' }} />
      </div>

      {/* Filter chips skeleton */}
      <div className="flex items-center gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-7 w-20 rounded-full" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
        ))}
      </div>

      {/* Table skeleton */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: 'white', border: '1px solid var(--color-neutral-200)', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)' }}
      >
        <div className="flex items-center gap-4 px-4 py-3" style={{ borderBottom: '1px solid var(--color-neutral-200)' }}>
          <div className="h-3 flex-1 rounded" style={{ backgroundColor: 'var(--color-neutral-200)' }} />
          <div className="h-3 w-24 rounded" style={{ backgroundColor: 'var(--color-neutral-200)' }} />
          <div className="h-3 w-24 rounded" style={{ backgroundColor: 'var(--color-neutral-200)' }} />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4" style={{ borderBottom: '1px solid var(--color-neutral-100)' }}>
            <div className="h-4 flex-1 rounded" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
            <div className="h-3 w-20 rounded" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
            <div className="h-2 w-24 rounded-full" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
