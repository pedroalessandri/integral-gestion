export default function ObjectivesLoading() {
  return (
    <div className="space-y-6 max-w-5xl animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div
            className="h-7 w-36 rounded-md"
            style={{ backgroundColor: 'var(--color-neutral-200)' }}
          />
          <div
            className="h-4 w-52 rounded-md"
            style={{ backgroundColor: 'var(--color-neutral-100)' }}
          />
        </div>
        <div
          className="h-10 w-40 rounded-md"
          style={{ backgroundColor: 'var(--color-neutral-200)' }}
        />
      </div>

      {/* Table skeleton */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: 'white',
          border: '1px solid var(--color-neutral-200)',
          boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)',
        }}
      >
        {/* Table header */}
        <div
          className="flex items-center gap-4 px-4 py-3"
          style={{ borderBottom: '1px solid var(--color-neutral-200)' }}
        >
          <div className="h-3 flex-1 rounded" style={{ backgroundColor: 'var(--color-neutral-200)' }} />
          <div className="h-3 w-24 rounded" style={{ backgroundColor: 'var(--color-neutral-200)' }} />
          <div className="h-3 w-24 rounded" style={{ backgroundColor: 'var(--color-neutral-200)' }} />
          <div className="h-3 w-20 rounded" style={{ backgroundColor: 'var(--color-neutral-200)' }} />
        </div>
        {/* Rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-4"
            style={{ borderBottom: '1px solid var(--color-neutral-100)' }}
          >
            <div className="h-4 flex-1 rounded" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
            <div className="h-2 w-24 rounded-full" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
            <div className="h-3 w-20 rounded" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
            <div className="h-3 w-16 rounded" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
