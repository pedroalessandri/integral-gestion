'use client';

export interface ExecutiveViewToggleProps {
  showTasks: boolean;
  onToggle: (next: boolean) => void;
}

export function ExecutiveViewToggle({ showTasks, onToggle }: ExecutiveViewToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-sm select-none"
        style={{ color: 'var(--color-neutral-700)' }}
      >
        Mostrar tareas
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={showTasks}
        onClick={() => onToggle(!showTasks)}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          width: 36,
          height: 20,
          borderRadius: 9999,
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          backgroundColor: showTasks ? 'var(--color-primary-600)' : 'var(--color-neutral-300)',
          transition: 'background-color 150ms ease',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            display: 'block',
            width: 16,
            height: 16,
            borderRadius: 9999,
            backgroundColor: 'white',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            transform: showTasks ? 'translateX(18px)' : 'translateX(2px)',
            transition: 'transform 150ms ease',
          }}
        />
      </button>
    </div>
  );
}
