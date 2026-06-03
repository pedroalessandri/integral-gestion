import type { OwnerSummaryDto } from '@gestion-publica/shared-types/okr';
import { AvatarFromName } from '@/components/ui/avatar-from-name';
import { cn } from '@/lib/utils';

interface OwnerPillProps {
  owner: OwnerSummaryDto | null;
  onClick?: () => void;
  size?: 'sm' | 'md';
}

export function OwnerPill({ owner, onClick, size = 'md' }: OwnerPillProps) {
  const isInteractive = onClick !== undefined;

  const inner = owner ? (
    <span className="flex items-center gap-1.5">
      <AvatarFromName name={owner.displayName} size={size} />
      <span
        className={cn(
          'font-medium text-neutral-700',
          size === 'sm' ? 'text-xs' : 'text-sm',
        )}
        title={owner.email}
      >
        {owner.displayName}
      </span>
    </span>
  ) : (
    <span
      className={cn(
        'text-neutral-400 italic',
        size === 'sm' ? 'text-xs' : 'text-sm',
      )}
    >
      Sin asignar
    </span>
  );

  if (isInteractive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 transition-colors',
          'hover:bg-neutral-100 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-500',
        )}
        aria-label={owner ? `Responsable: ${owner.displayName}. Hacer clic para editar.` : 'Sin responsable asignado. Hacer clic para editar.'}
      >
        {inner}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5">
      {inner}
    </span>
  );
}
