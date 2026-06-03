import { Circle, Clock, CheckCircle2, AlertTriangle, type LucideIcon } from 'lucide-react';
import type { TaskStatus, ProgressStatus } from '@gestion-publica/shared-types/okr';

type AnyStatus = TaskStatus | ProgressStatus;

interface StatusConfig {
  Icon: LucideIcon;
  color: string;
  label: string;
}

const statusConfig: Record<AnyStatus, StatusConfig> = {
  pending:     { Icon: Circle,         color: 'var(--color-neutral-500)', label: 'Pendiente' },
  in_progress: { Icon: Clock,          color: 'var(--color-info)',        label: 'En curso' },
  done:        { Icon: CheckCircle2,   color: 'var(--color-success)',     label: 'Completado' },
  overdue:     { Icon: AlertTriangle,  color: 'var(--color-danger)',      label: 'Vencido' },
};

interface StatusIconProps {
  status: AnyStatus;
  /** Pixel size of the icon. Default 16. */
  size?: number;
  className?: string;
}

export function StatusIcon({ status, size = 16, className = '' }: StatusIconProps) {
  const { Icon, color, label } = statusConfig[status];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex items-center shrink-0 ${className}`}
    >
      <Icon size={size} color={color} aria-hidden="true" />
    </span>
  );
}
