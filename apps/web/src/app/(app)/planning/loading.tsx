export default function PlanningTreeLoading() {
  return (
    <div className="space-y-6 max-w-6xl animate-pulse" role="status" aria-label="Cargando el árbol de planificación">
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-md bg-neutral-200" />
        <div className="h-4 w-80 rounded-md bg-neutral-100" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 rounded-md bg-neutral-100" />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-20 rounded-lg bg-neutral-100" />
      ))}
    </div>
  );
}
