export default function ObjectiveDetailLoading() {
  return (
    <div className="space-y-6 max-w-5xl animate-pulse">
      {/* Back link skeleton */}
      <div className="h-4 w-32 rounded" style={{ backgroundColor: 'var(--color-neutral-200)' }} />

      {/* Header skeleton */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="h-7 w-2/3 rounded-md" style={{ backgroundColor: 'var(--color-neutral-200)' }} />
          <div className="h-4 w-1/2 rounded-md" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
        </div>
        {/* Progress ring skeleton */}
        <div
          className="w-18 h-18 rounded-full shrink-0"
          style={{ width: 72, height: 72, backgroundColor: 'var(--color-neutral-200)' }}
        />
      </div>

      {/* KR card skeleton */}
      <div
        className="rounded-xl p-6 space-y-4"
        style={{
          backgroundColor: 'white',
          border: '1px solid var(--color-neutral-200)',
          boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)',
        }}
      >
        {/* Card header */}
        <div className="flex items-center justify-between">
          <div className="h-5 w-28 rounded" style={{ backgroundColor: 'var(--color-neutral-200)' }} />
          <div className="h-9 w-36 rounded-md" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
        </div>
        {/* KR items */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-4 space-y-3"
            style={{ border: '1px solid var(--color-neutral-200)' }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded" style={{ backgroundColor: 'var(--color-neutral-200)' }} />
                <div className="h-3 w-1/3 rounded" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
              </div>
              <div className="space-y-1 text-right">
                <div className="h-5 w-12 rounded" style={{ backgroundColor: 'var(--color-neutral-200)' }} />
                <div className="h-1.5 w-24 rounded-full" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
              </div>
            </div>
            <div className="pl-4 space-y-2" style={{ borderLeft: '2px solid var(--color-neutral-200)' }}>
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3 py-2">
                  <div className="h-3 flex-1 rounded" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
                  <div className="h-1.5 flex-1 max-w-xs rounded-full" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
