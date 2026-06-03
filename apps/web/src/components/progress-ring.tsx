interface ProgressRingProps {
  valueBp: number;
  size?: number;
}

export function ProgressRing({ valueBp, size = 72 }: ProgressRingProps) {
  const pct = Math.max(0, Math.min(10000, valueBp)) / 100;
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--color-neutral-200)"
          strokeWidth="4"
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--color-primary-600)"
          strokeWidth="4"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 500ms ease' }}
        />
      </svg>
      <span
        className="absolute text-sm font-semibold"
        style={{ color: 'var(--color-neutral-900)' }}
      >
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}
