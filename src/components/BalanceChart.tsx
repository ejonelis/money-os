"use client";

import { useRef, useState } from "react";

export type ChartPoint = { date: string; value: number; label?: string | null };

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

// Step line of a balance over time: the balance holds until the next
// entry changes it. `reference` draws a dashed line (zero, or a credit limit).
export function BalanceChart({
  points,
  reference,
  valueLabel,
}: {
  points: ChartPoint[];
  reference?: { value: number; label: string };
  valueLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) return null;

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

  let path = `M ${sx(xs[0])} ${sy(values[0])}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${sx(xs[i])} ${sy(values[i - 1])} L ${sx(xs[i])} ${sy(values[i])}`;
  }

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
      <h2 className="text-sm font-medium text-muted">{valueLabel}</h2>
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
          <path
            d={path}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
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
