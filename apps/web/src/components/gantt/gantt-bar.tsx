import Link from 'next/link';
import type { ProgressStatus, TaskStatus } from '@gestion-publica/shared-types/okr';

export interface GanttBarProps {
  periodStartsAt: string;
  periodEndsAt: string;
  itemStartsAt: string;
  itemEndsAt: string;
  /** 0..10000 */
  fillBp: number;
  status: ProgressStatus | TaskStatus;
  href: string;
  ariaLabel: string;
}

/** Returns UTC midnight from any ISO string. */
function toUTCMidnight(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Day difference (end − start), rounded to nearest day. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

type StatusColor = {
  solid: string;
  bg: string;
};

const statusColors: Record<ProgressStatus | TaskStatus, StatusColor> = {
  pending: { solid: 'var(--color-neutral-300)', bg: 'var(--color-neutral-300)' },
  in_progress: { solid: '#3b82f6', bg: 'rgba(59,130,246,0.2)' },
  done: { solid: '#10b981', bg: 'rgba(16,185,129,0.2)' },
  overdue: { solid: '#ef4444', bg: 'rgba(239,68,68,0.2)' },
};

export function GanttBar({
  periodStartsAt,
  periodEndsAt,
  itemStartsAt,
  itemEndsAt,
  fillBp,
  status,
  href,
  ariaLabel,
}: GanttBarProps) {
  const periodStart = toUTCMidnight(periodStartsAt);
  const periodEnd = toUTCMidnight(periodEndsAt);
  const periodDays = Math.max(1, daysBetween(periodStart, periodEnd));

  const itemStart = toUTCMidnight(itemStartsAt);
  const itemEnd = toUTCMidnight(itemEndsAt);

  const clampedStartDay = Math.max(0, daysBetween(periodStart, itemStart));
  const clampedEndDay = Math.min(periodDays, daysBetween(periodStart, itemEnd) + 1);

  const leftPct = (clampedStartDay / periodDays) * 100;
  const widthPct = Math.max(0, ((clampedEndDay - clampedStartDay) / periodDays) * 100);

  const fill = Math.max(0, fillBp / 10000);
  const fillPct = fill * 100;

  const colors = statusColors[status];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Link
        href={href}
        aria-label={ariaLabel}
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          minWidth: 4,
          top: '50%',
          transform: 'translateY(-50%)',
          height: 16,
          borderRadius: 4,
          backgroundColor: colors.bg,
          overflow: 'hidden',
          cursor: 'pointer',
          display: 'block',
          textDecoration: 'none',
        }}
      >
        {fillBp > 0 && (
          <div
            style={{
              width: `${fillPct}%`,
              minWidth: 4,
              height: '100%',
              backgroundColor: colors.solid,
              borderRadius: 4,
            }}
          />
        )}
      </Link>
    </div>
  );
}
