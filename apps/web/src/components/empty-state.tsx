import { type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: 'var(--color-primary-50)' }}
      >
        <Icon className="w-6 h-6" style={{ color: 'var(--color-primary-600)' }} />
      </div>
      <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-neutral-900)' }}>
        {title}
      </h3>
      <p className="text-sm max-w-sm mb-4" style={{ color: 'var(--color-neutral-500)' }}>
        {description}
      </p>
      {action}
    </div>
  );
}
