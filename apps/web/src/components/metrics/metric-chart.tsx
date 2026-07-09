'use client';

import type { MetricSeriesDto, MetricUnit } from '@gestion-publica/shared-types/metrics';
import { formatMetricValue } from './format';

interface Props {
  series: MetricSeriesDto;
  unit: MetricUnit;
  baselineValue: string;
  targetValue: string;
  periodStartsAt: string;
  periodEndsAt: string;
}

// SVG viewport (scales responsively via width:100%). Hand-rolled like the Gantt
// axis — no charting dependency (CLAUDE.md rule 11).
const W = 720;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

export function MetricChart({ series, unit, baselineValue, targetValue, periodStartsAt, periodEndsAt }: Props) {
  const xMin = new Date(periodStartsAt).getTime();
  const xMax = new Date(periodEndsAt).getTime();
  const xSpan = Math.max(1, xMax - xMin);

  const baseline = Number(baselineValue);
  const target = Number(targetValue);

  const expected = series.expected.map((p) => ({ t: new Date(p.date).getTime(), v: Number(p.value) }));
  const actual = series.actual.map((p) => ({ t: new Date(p.bucketDate).getTime(), v: Number(p.cumulativeValue) }));

  const allValues = [baseline, target, ...expected.map((p) => p.v), ...actual.map((p) => p.v)];
  let yMin = Math.min(...allValues);
  let yMax = Math.max(...allValues);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  // Pad the vertical range ~8% so lines don't touch the frame.
  const yPad = (yMax - yMin) * 0.08;
  yMin -= yPad;
  yMax += yPad;
  const ySpan = yMax - yMin;

  const x = (t: number) => PAD.left + ((t - xMin) / xSpan) * PLOT_W;
  const y = (v: number) => PAD.top + PLOT_H - ((v - yMin) / ySpan) * PLOT_H;

  const expectedPath = expected.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const actualPath = actual.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');

  const targetY = y(target);
  const yTicks = [yMin + ySpan * 0.08, yMin + ySpan / 2, yMax - ySpan * 0.08];

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', minWidth: 420, height: 'auto', display: 'block' }}
        role="img"
        aria-label="Curva esperada versus real del indicador"
      >
        {/* Y grid + labels */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--color-neutral-100)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--color-neutral-400)">
              {formatMetricValue(String(Math.round(v * 100) / 100), unit)}
            </text>
          </g>
        ))}

        {/* X axis baseline */}
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + PLOT_H} y2={PAD.top + PLOT_H} stroke="var(--color-neutral-200)" strokeWidth={1} />
        <text x={PAD.left} y={H - 8} textAnchor="start" fontSize={10} fill="var(--color-neutral-400)">
          {new Date(periodStartsAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={10} fill="var(--color-neutral-400)">
          {new Date(periodEndsAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
        </text>

        {/* Target reference line */}
        <line x1={PAD.left} x2={W - PAD.right} y1={targetY} y2={targetY} stroke="#f59e0b" strokeWidth={1} strokeDasharray="2 3" />
        <text x={W - PAD.right} y={targetY - 4} textAnchor="end" fontSize={10} fill="#b45309">
          Meta {formatMetricValue(targetValue, unit)}
        </text>

        {/* Expected curve — dashed gray */}
        {expected.length > 1 && (
          <path d={expectedPath} fill="none" stroke="var(--color-neutral-400)" strokeWidth={1.5} strokeDasharray="5 4" />
        )}

        {/* Actual curve — solid primary with points */}
        {actual.length > 0 && (
          <>
            {actual.length > 1 && <path d={actualPath} fill="none" stroke="var(--color-primary-600)" strokeWidth={2} />}
            {actual.map((p, i) => (
              <circle key={i} cx={x(p.t)} cy={y(p.v)} r={3} fill="var(--color-primary-600)" />
            ))}
          </>
        )}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: 'var(--color-neutral-500)' }}>
        <LegendItem color="var(--color-primary-600)" label="Real (acumulado)" />
        <LegendItem color="var(--color-neutral-400)" label="Esperado (lineal)" dashed />
        <LegendItem color="#f59e0b" label="Meta" dashed />
      </div>
    </div>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 16,
          height: 0,
          borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
        }}
      />
      {label}
    </span>
  );
}
