"use client";

import { useRef, useState } from "react";

export type Series = {
  id: string;
  name: string;
  color: string;
  points: Array<{ date: string; value: number }>;
};

const W = 800;
const H = 280;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

const euro0 = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const euro2 = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

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

// One straight-line series per account (balances are point-in-time
// readings), sharing axes. Hovering lists every series' value at that date.
export function MultiLineChart({
  series,
  valueLabel,
  controls,
}: {
  series: Series[];
  valueLabel: string;
  controls?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverMs, setHoverMs] = useState<number | null>(null);

  const all = series.flatMap((s) => s.points.map((p) => ({ ms: toMs(p.date), v: p.value })));

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-medium text-muted">{valueLabel}</h2>
      {controls}
    </div>
  );

  if (all.length < 2) {
    return (
      <div className="space-y-2">
        {header}
        <p className="rounded-lg border border-hairline px-4 py-6 text-center text-sm text-foreground/40 shadow-card">
          Not enough data to chart.
        </p>
      </div>
    );
  }

  const xMin = Math.min(...all.map((a) => a.ms));
  const xMax = Math.max(Math.max(...all.map((a) => a.ms)), xMin + 86_400_000);
  let yMin = Math.min(...all.map((a) => a.v));
  let yMax = Math.max(...all.map((a) => a.v));
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

  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);
  const xTicks = Array.from({ length: 5 }, (_, i) => xMin + ((xMax - xMin) * i) / 4);

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const ms = xMin + ((px - PAD.left) / (W - PAD.left - PAD.right)) * (xMax - xMin);
    setHoverMs(Math.min(xMax, Math.max(xMin, ms)));
  }

  // Each series' value at the hovered date (its latest reading before it).
  const hoverRows =
    hoverMs === null
      ? []
      : series
          .map((s) => {
            let value: number | null = null;
            for (const p of s.points) if (toMs(p.date) <= hoverMs) value = p.value;
            return { s, value };
          })
          .filter((r): r is { s: Series; value: number } => r.value !== null)
          .sort((a, b) => b.value - a.value);
  const hx = hoverMs === null ? 0 : sx(hoverMs);

  return (
    <div className="space-y-2">
      {header}
      <div
        ref={ref}
        className="relative rounded-lg border border-hairline p-3 shadow-card"
        onPointerMove={onMove}
        onPointerLeave={() => setHoverMs(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={valueLabel}>
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
              <text x={PAD.left - 8} y={sy(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
                {euro0.format(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={sx(t)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {fmtDate(t)}
            </text>
          ))}
          {yMin < 0 && yMax > 0 && (
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={sy(0)}
              y2={sy(0)}
              stroke="var(--muted)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}
          {series.map((s) => (
            <path
              key={s.id}
              d={s.points
                .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(toMs(p.date))} ${sy(p.value)}`)
                .join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          ))}
          {hoverMs !== null && (
            <g>
              <line
                x1={hx}
                x2={hx}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="var(--muted)"
                strokeWidth={1}
              />
              {hoverRows.map((r) => (
                <circle key={r.s.id} cx={hx} cy={sy(r.value)} r={3.5} fill={r.s.color} />
              ))}
            </g>
          )}
        </svg>
        {hoverMs !== null && hoverRows.length > 0 && (
          <div
            className="pointer-events-none absolute top-3 rounded-lg border border-hairline bg-background px-3 py-2 text-xs shadow-md"
            style={{
              left: `${(hx / W) * 100}%`,
              transform: hx > W * 0.6 ? "translateX(-105%)" : "translateX(8px)",
            }}
          >
            <p className="mb-1 text-muted">{fmtDate(hoverMs)}</p>
            {hoverRows.map((r) => (
              <p key={r.s.id} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.s.color }} />
                  {r.s.name}
                </span>
                <span className="font-medium tabular-nums">{euro2.format(r.value)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
