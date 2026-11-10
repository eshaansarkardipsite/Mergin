import { useId, useState } from 'react';
import { formatMoneyCompact } from '../lib/format';

interface Point {
  label: string;
  value: number;
}

export function LineAreaChart({
  points,
  height = 220,
  valueLabel = 'Balance',
  showAxis = true,
}: {
  points: Point[];
  height?: number;
  valueLabel?: string;
  showAxis?: boolean;
}) {
  const gradientId = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-body-md text-ink-muted">No data for this period.</div>
    );
  }

  const width = 740;
  const padTop = 16;
  const padBottom = 12;
  const chartHeight = height - padTop - padBottom;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xFor = (index: number) => (points.length === 1 ? width / 2 : (index / (points.length - 1)) * width);
  const yFor = (value: number) => padTop + chartHeight - ((value - min) / span) * chartHeight * 0.86 - chartHeight * 0.07;

  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(2)} ${yFor(point.value).toFixed(2)}`).join(' ');
  const area = `${line} L ${width} ${height - padBottom} L 0 ${height - padBottom} Z`;
  const active = hover ?? points.length - 1;

  return (
    <div className="w-full">
      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label={`${valueLabel} chart with ${points.length} points`}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`fill-${gradientId}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0A0A0A" stopOpacity="0.14" />
              <stop offset="70%" stopColor="#0A0A0A" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#0A0A0A" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.2, 0.4, 0.6, 0.8].map((fraction) => (
            <line
              key={fraction}
              x1="0"
              x2={width}
              y1={padTop + chartHeight * fraction}
              y2={padTop + chartHeight * fraction}
              stroke="#EAEAEA"
              strokeWidth="1"
            />
          ))}
          <path d={area} fill={`url(#fill-${gradientId})`} />
          <path d={line} fill="none" stroke="#0A0A0A" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point, index) => (
            <g key={`${point.label}-${index}`}>
              <rect
                x={xFor(index) - width / (points.length * 2)}
                y="0"
                width={width / points.length}
                height={height}
                fill="transparent"
                onMouseEnter={() => setHover(index)}
                onFocus={() => setHover(index)}
                tabIndex={-1}
              />
              {index === points.length - 1 || hover === index ? (
                <circle
                  cx={xFor(index)}
                  cy={yFor(point.value)}
                  r={hover === index ? 5 : 4}
                  fill={index === points.length - 1 ? '#0A0A0A' : '#FFFFFF'}
                  stroke="#0A0A0A"
                  strokeWidth="2"
                />
              ) : null}
            </g>
          ))}
        </svg>
        <div className="pointer-events-none absolute right-2 top-0 rounded-lg bg-ink-solid px-2.5 py-1 text-caption-micro tabular-nums text-on-primary shadow-md">
          {points[active].label}: {formatMoneyCompact(points[active].value)}
        </div>
      </div>
      {showAxis ? (
        <div className="mt-2 flex items-center justify-between text-caption-micro text-ink-muted">
          {points.map((point, index) => (
            <span key={`${point.label}-${index}`} className={index === points.length - 1 ? 'font-medium text-ink-solid' : ''}>
              {point.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DualBarChart({
  data,
  primaryLabel = 'Inflow',
  secondaryLabel = 'Outflow',
  height = 200,
}: {
  data: { label: string; primary: number; secondary: number }[];
  primaryLabel?: string;
  secondaryLabel?: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.flatMap((item) => [item.primary, item.secondary]));
  return (
    <div>
      <div className="mb-4 flex items-center gap-4 text-caption-micro text-ink-slate">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-ink-solid" /> {primaryLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-surface-container-highest" /> {secondaryLabel}
        </span>
      </div>
      <div className="flex items-end gap-3" style={{ height }}>
        {data.map((item) => (
          <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div className="flex h-full w-full items-end justify-center gap-1">
              <div
                className="w-full max-w-[26px] rounded-t-sm bg-ink-solid transition-all"
                style={{ height: `${Math.max(2, (item.primary / max) * 100)}%` }}
                title={`${item.label} ${primaryLabel}: ${formatMoneyCompact(item.primary)}`}
              />
              <div
                className="w-full max-w-[26px] rounded-t-sm bg-surface-container-highest transition-all"
                style={{ height: `${Math.max(2, (item.secondary / max) * 100)}%` }}
                title={`${item.label} ${secondaryLabel}: ${formatMoneyCompact(item.secondary)}`}
              />
            </div>
            <span className="text-caption-micro text-ink-muted">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ values, width = 120, height = 32 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => `${(index / (values.length - 1)) * width},${height - ((value - min) / span) * (height - 4) - 2}`)
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
      <polyline points={points} fill="none" stroke="#0A0A0A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UsageMeter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-caption-micro text-ink-slate">
        <span>{label}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
        <div className="h-full rounded-full bg-ink-solid" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
