"use client";

import { useRef, useState } from "react";

export type ChartPoint = {
  date: string;
  value: number;
  label?: string | null;
  // Planned entries after today; everything before is recorded history.
  forecast?: boolean;
};

const W = 800;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

const euro0 = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const euro2 = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

function toMs(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-IE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// Balance over time. Recorded history is joined with straight lines (they
// are point-in-time readings); the forecast is a dashed step line, since a
// balance holds until the next entry changes it. `reference` draws a dashed
// line (zero, or a credit limit).
export function BalanceChart({
  points,
  reference,
  valueLabel,
  controls,
}: {
  points: ChartPoint[];
  reference?: { value: number; label: string };
  valueLabel: string;
  controls?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) {
    // Keep the range controls so a too-narrow range can be widened again.
    if (!controls) return null;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted">{valueLabel}</h2>
          {controls}
        </div>
        <p className="rounded-lg border border-hairline px-4 py-6 text-center text-sm text-foreground/40 shadow-card">
          Not enough data in this range.
        </p>
      </div>
    );
  }

  const xs = points.map((p) => toMs(p.date));
  const xMin = xs[0];
  const xMax = Math.max(xs[xs.length - 1], xMin + 86_400_000);
  const values = points.map((p) => p.value);
  let yMin = Math.min(...values, reference?.value ?? Infinity);
  let yMax = Math.max(...values, reference?.value ?? -Infinity);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const pad = (yMax - yMin) * 0.08;
  yMin -= pad;
  yMax += pad;

  const sx = (ms: number) =>
    PAD.left + ((ms - xMin) / (xMax - xMin)) * (W - PAD.left - PAD.right);
  const sy = (v: number) =>
    PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);

  // Split at the first forecast point: history is linear, forecast steps.
  let split = points.findIndex((p) => p.forecast);
  if (split === -1) split = points.length;
  const lastHistory = Math.max(0, split - 1);
  let historyPath = "";
  for (let i = 0; i <= lastHistory; i++) {
    historyPath += `${i === 0 ? "M" : " L"} ${sx(xs[i])} ${sy(values[i])}`;
  }
  let forecastPath = `M ${sx(xs[lastHistory])} ${sy(values[lastHistory])}`;
  for (let i = lastHistory + 1; i < points.length; i++) {
    forecastPath += ` L ${sx(xs[i])} ${sy(values[i - 1])} L ${sx(xs[i])} ${sy(values[i])}`;
  }
  const todayX = sx(xs[lastHistory]);
  const hasHistory = lastHistory > 0;

  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);
  const xTicks = Array.from({ length: 5 }, (_, i) => xMin + ((xMax - xMin) * i) / 4);

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const ms = xMin + ((px - PAD.left) / (W - PAD.left - PAD.right)) * (xMax - xMin);
    let idx = 0;
    for (let i = 0; i < xs.length; i++) if (xs[i] <= ms) idx = i;
    setHover(idx);
  }

  const hp = hover !== null ? points[hover] : null;
  const hx = hover !== null ? sx(xs[hover]) : 0;
  const hy = hover !== null ? sy(values[hover]) : 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted">{valueLabel}</h2>
        {controls}
      </div>
      <div
        ref={ref}
        className="relative rounded-lg border border-hairline p-3 shadow-card"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          role="img"
          aria-label={valueLabel}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={sy(t)}
                y2={sy(t)}
                stroke="var(--hairline)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={sy(t) + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--muted)"
              >
                {euro0.format(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text
              key={t}
              x={sx(t)}
              y={H - 8}
              textAnchor="middle"
              fontSize={11}
              fill="var(--muted)"
            >
              {fmtDate(t)}
            </text>
          ))}
          {reference && (
            <g>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={sy(reference.value)}
                y2={sy(reference.value)}
                stroke="var(--muted)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={W - PAD.right}
                y={sy(reference.value) - 5}
                textAnchor="end"
                fontSize={11}
                fill="var(--muted)"
              >
                {reference.label}
              </text>
            </g>
          )}
          {hasHistory && (
            <g>
              <line
                x1={todayX}
                x2={todayX}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="var(--muted)"
                strokeWidth={1}
                strokeDasharray="2 4"
              />
              <text x={todayX + 5} y={PAD.top + 10} fontSize={11} fill="var(--muted)">
                Today
              </text>
            </g>
          )}
          <path
            d={historyPath}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {split < points.length && (
            <path
              d={forecastPath}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeDasharray="6 4"
            />
          )}
          {hp && (
            <g>
              <line
                x1={hx}
                x2={hx}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="var(--muted)"
                strokeWidth={1}
              />
              <circle cx={hx} cy={hy} r={4} fill="var(--accent)" />
            </g>
          )}
        </svg>
        {hp && (
          <div
            className="pointer-events-none absolute top-3 rounded-lg border border-hairline bg-background px-3 py-2 text-xs shadow-md"
            style={{
              left: `${(hx / W) * 100}%`,
              transform: hx > W * 0.6 ? "translateX(-105%)" : "translateX(8px)",
            }}
          >
            <p className="text-muted">
              {fmtDate(xs[hover!])}
              {hp.label ? ` · ${hp.label}` : ""}
            </p>
            <p className="font-medium tabular-nums">{euro2.format(hp.value)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export type ChartRange = "1M" | "3M" | "6M" | "1Y" | "All";

const RANGE_DAYS: Record<ChartRange, number | null> = {
  "1M": 30,
  "3M": 90,
  "6M": 182,
  "1Y": 365,
  All: null,
};

// The ISO date a range starts from (today minus N days), or "" for All.
// A picked "From" date wins over the preset.
export function rangeStart(range: ChartRange, fromDate: string, today: string) {
  if (fromDate) return fromDate;
  const days = RANGE_DAYS[range];
  if (days === null) return "";
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function ChartRangeControls({
  range,
  onRange,
  fromDate,
  onFromDate,
  today,
}: {
  range: ChartRange;
  onRange: (r: ChartRange) => void;
  fromDate: string;
  onFromDate: (d: string) => void;
  today: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-full border border-hairline p-1">
        {(Object.keys(RANGE_DAYS) as ChartRange[]).map((r) => (
          <button
            key={r}
            onClick={() => {
              onRange(r);
              onFromDate("");
            }}
            className={`rounded px-2.5 py-0.5 text-xs transition-colors ${
              !fromDate && range === r
                ? "bg-accent text-white"
                : "text-muted hover:text-accent"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-xs text-muted">
        From
        <input
          type="date"
          value={fromDate}
          max={today}
          onChange={(e) => onFromDate(e.target.value)}
          className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
        />
      </label>
    </div>
  );
}
