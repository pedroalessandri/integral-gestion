export default function ObjectiveDetailLoading() {
  return (
    <div className="space-y-6 max-w-5xl animate-pulse">
      {/* Back link skeleton */}
      <div className="h-4 w-32 rounded" style={{ backgroundColor: 'var(--color-neutral-200)' }} />

      {/* Header skeleton: título + las dos lecturas de avance */}
      <div className="space-y-3">
        <div className="h-7 w-2/3 rounded-md" style={{ backgroundColor: 'var(--color-neutral-200)' }} />
        <div className="h-4 w-1/2 rounded-md" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
        <div className="grid max-w-xl grid-cols-1 gap-x-6 gap-y-3 pt-2 sm:grid-cols-2">
          <div className="h-8 rounded-md" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
          <div className="h-8 rounded-md" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="h-9 w-80 rounded-md" style={{ backgroundColor: 'var(--color-neutral-100)' }} />

      {/* Contenido de la pestaña */}
      <div
        className="rounded-xl p-6 space-y-4"
        style={{
          backgroundColor: 'white',
          border: '1px solid var(--color-neutral-200)',
          boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)',
        }}
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-4 space-y-2"
            style={{ border: '1px solid var(--color-neutral-200)' }}
          >
            <div className="h-4 w-3/4 rounded" style={{ backgroundColor: 'var(--color-neutral-200)' }} />
            <div className="h-3 w-1/3 rounded" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
