/**
 * GanttAxis — renders the date axis row above Gantt rows.
 *
 * Layout (top-to-bottom):
 *   1. Month band: every month that intersects the period gets a horizontal
 *      span with its name centered. Visual frame of reference regardless of
 *      period length.
 *   2. Day/week/month tick row: adaptive density
 *      - period <= 30d  → per day, format "15"
 *      - period <= 90d  → per Monday, format "15 abr"
 *      - period > 90d   → per month start, format "abr 2026"
 *
 * Labels positioned absolutely as % of the right column width.
 *   - Anchors at 0% and 100% always show the full period start/end date.
 */

interface GanttAxisProps {
  periodStartsAt: string;
  periodEndsAt: string;
}

/** Returns UTC midnight from any ISO string. */
function toUTCMidnight(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Inclusive day count between two UTC midnight dates. */
function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/** Returns the Monday on or after `d`. */
function nextMonday(d: Date): Date {
  const result = new Date(d);
  const dow = result.getUTCDay(); // 0=Sun
  const daysUntilMonday = dow === 1 ? 0 : (8 - dow) % 7;
  result.setUTCDate(result.getUTCDate() + daysUntilMonday);
  return result;
}

interface AxisLabel {
  label: string;
  offsetDays: number;
}

function buildLabels(start: Date, periodDays: number): AxisLabel[] {
  const labels: AxisLabel[] = [];

  if (periodDays <= 30) {
    // One label per day
    for (let i = 0; i <= periodDays; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      labels.push({
        label: String(d.getUTCDate()),
        offsetDays: i,
      });
    }
  } else if (periodDays <= 90) {
    // One label per Monday
    let cursor = nextMonday(start);
    while (daysBetween(start, cursor) <= periodDays) {
      const offsetDays = daysBetween(start, cursor);
      labels.push({
        label: cursor.toLocaleDateString('es-AR', {
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        }),
        offsetDays,
      });
      cursor = new Date(cursor);
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  } else {
    // One label per month start
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth();
    // Start from the first of the next month if start is not the 1st
    let cursor = new Date(Date.UTC(year, month, 1));
    if (cursor.getTime() < start.getTime()) {
      cursor = new Date(Date.UTC(year, month + 1, 1));
    }
    while (daysBetween(start, cursor) <= periodDays) {
      const offsetDays = Math.max(0, daysBetween(start, cursor));
      labels.push({
        label: cursor.toLocaleDateString('es-AR', {
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }),
        offsetDays,
      });
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
  }

  return labels;
}

/** Formats an ISO date as an anchor label in es-AR locale (e.g. "1 ene").
 * Year is intentionally omitted — the month band on top carries the year when
 * the period crosses years; otherwise the year is redundant and the anchor
 * labels collide with intermediate ticks. */
function formatAnchorDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

interface MonthBand {
  /** Span start offset (days from period start). */
  startOffsetDays: number;
  /** Span width in days, clipped to the period. */
  widthDays: number;
  /** e.g. "ene" or "ene 2026" if the period crosses years. */
  label: string;
}

/**
 * Builds the list of month spans that intersect the period. Each span is
 * clipped to the period boundaries, so the first/last month can be partial.
 *
 * If the period crosses years, the label includes the year ("ene 2026") to
 * disambiguate; otherwise just the short month name ("ene").
 */
function buildMonthBands(start: Date, periodDays: number): MonthBand[] {
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + periodDays);

  const crossesYears = start.getUTCFullYear() !== end.getUTCFullYear();

  const bands: MonthBand[] = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));

  while (cursor.getTime() <= end.getTime()) {
    const nextMonth = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
    );
    const spanStart = cursor.getTime() < start.getTime() ? start : cursor;
    const spanEnd = nextMonth.getTime() > end.getTime() ? end : nextMonth;

    const startOffsetDays = daysBetween(start, spanStart);
    const widthDays = daysBetween(spanStart, spanEnd);

    if (widthDays > 0) {
      bands.push({
        startOffsetDays,
        widthDays,
        label: crossesYears
          ? cursor.toLocaleDateString('es-AR', {
              month: 'short',
              year: 'numeric',
              timeZone: 'UTC',
            })
          : cursor.toLocaleDateString('es-AR', {
              month: 'short',
              timeZone: 'UTC',
            }),
      });
    }

    cursor = nextMonth;
  }

  return bands;
}

/** Minimum width (in % of axis) for a month label to be rendered. Avoids
 * overlapping labels when a partial month at an edge is too narrow. */
const MONTH_LABEL_MIN_WIDTH_PCT = 6;

/**
 * Returns the horizontal positions (in % of the right-column width) of every
 * month boundary inside the period — i.e. the start of each month except the
 * very first one and except positions ≥ 100%. Used by the chart body to draw
 * vertical guides aligned with the month band.
 */
export function getMonthBoundaryPercentages(
  periodStartsAt: string,
  periodEndsAt: string,
): number[] {
  const start = toUTCMidnight(periodStartsAt);
  const end = toUTCMidnight(periodEndsAt);
  const periodDays = Math.max(1, daysBetween(start, end));
  const bands = buildMonthBands(start, periodDays);

  return bands
    .map((b) => (b.startOffsetDays / periodDays) * 100)
    .filter((pct) => pct > 0 && pct < 100);
}

export function GanttAxis({ periodStartsAt, periodEndsAt }: GanttAxisProps) {
  const start = toUTCMidnight(periodStartsAt);
  const end = toUTCMidnight(periodEndsAt);
  const periodDays = Math.max(1, daysBetween(start, end));
  const labels = buildLabels(start, periodDays);
  const monthBands = buildMonthBands(start, periodDays);

  // Drop intermediate labels that coincide with or are too close to the anchors.
  const dropThresholdDays = Math.max(1, Math.ceil(periodDays * 0.07));
  const filteredLabels = labels.filter((lbl) => {
    if (lbl.offsetDays === 0 || lbl.offsetDays === periodDays) return false;
    if (lbl.offsetDays <= dropThresholdDays) return false;
    if (lbl.offsetDays >= periodDays - dropThresholdDays) return false;
    return true;
  });

  return (
    <div
      style={{
        position: 'relative',
        height: 58,
        userSelect: 'none',
      }}
    >
      {/* Month band — top row with one span per month intersecting the period. */}
      <div
        style={{
          position: 'relative',
          height: 20,
          marginBottom: 4,
        }}
      >
        {monthBands.map((band) => {
          const leftPct = (band.startOffsetDays / periodDays) * 100;
          const widthPct = (band.widthDays / periodDays) * 100;
          const showLabel = widthPct >= MONTH_LABEL_MIN_WIDTH_PCT;
          return (
            <div
              key={`m-${band.startOffsetDays}-${band.label}`}
              style={{
                position: 'absolute',
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                top: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderLeft: band.startOffsetDays > 0
                  ? '1px solid var(--color-neutral-200)'
                  : 'none',
                backgroundColor: 'var(--color-neutral-50)',
                overflow: 'hidden',
              }}
            >
              {showLabel && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--color-neutral-600)',
                    textTransform: 'capitalize',
                    letterSpacing: '0.02em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {band.label.replace('.', '')}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Start anchor — always at 0%, left-aligned */}
      <div
        style={{
          position: 'absolute',
          left: '0%',
          top: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 2,
        }}
      >
        <span style={{ fontSize: 11, lineHeight: '1', color: 'var(--color-neutral-700)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {formatAnchorDate(periodStartsAt)}
        </span>
        <span style={{ display: 'block', width: 1, height: 6, backgroundColor: 'var(--color-neutral-200)' }} />
      </div>

      {/* End anchor — always at 100%, right-aligned */}
      <div
        style={{
          position: 'absolute',
          left: '100%',
          top: 24,
          transform: 'translateX(-100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 2,
        }}
      >
        <span style={{ fontSize: 11, lineHeight: '1', color: 'var(--color-neutral-700)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {formatAnchorDate(periodEndsAt)}
        </span>
        <span style={{ display: 'block', width: 1, height: 6, backgroundColor: 'var(--color-neutral-200)' }} />
      </div>

      {/* Intermediate labels */}
      {filteredLabels.map((lbl) => {
        const leftPct = (lbl.offsetDays / periodDays) * 100;
        return (
          <div
            key={`${lbl.offsetDays}-${lbl.label}`}
            style={{
              position: 'absolute',
              left: `${leftPct}%`,
              top: 24,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <span
              style={{
                fontSize: 11,
                lineHeight: '1',
                color: 'var(--color-neutral-500)',
                whiteSpace: 'nowrap',
              }}
            >
              {lbl.label}
            </span>
            <span
              style={{
                display: 'block',
                width: 1,
                height: 6,
                backgroundColor: 'var(--color-neutral-200)',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
