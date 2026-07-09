export default function MetricDetailLoading() {
  return (
    <div className="space-y-6 max-w-5xl animate-pulse">
      <div className="h-4 w-24 rounded" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
      <div className="space-y-2">
        <div className="h-7 w-64 rounded-md" style={{ backgroundColor: 'var(--color-neutral-200)' }} />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-5 w-24 rounded-full" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div
            className="rounded-xl border p-4"
            style={{ backgroundColor: 'white', borderColor: 'var(--color-neutral-200)' }}
          >
            <div className="h-56 w-full rounded" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
          </div>
        </div>
        <div className="lg:col-span-1">
          <div className="h-64 w-full rounded-xl" style={{ backgroundColor: 'var(--color-neutral-100)' }} />
        </div>
      </div>
    </div>
  );
}
