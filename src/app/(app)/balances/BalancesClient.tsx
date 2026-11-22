"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  saveDailyBalances,
  type SaveBalancesState,
  type SavedSnapshot,
} from "./actions";
import {
  ChartRangeControls,
  rangeStart,
  type ChartRange,
} from "@/components/BalanceChart";
import { MultiLineChart, type Series } from "@/components/MultiLineChart";

type Account = { id: string; name: string; is_liability: boolean };
type Snapshot = SavedSnapshot;

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function daysBetween(a: string, b: string) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / msPerDay,
  );
}

// Apple system colours, cycled per account.
const SERIES_COLORS = [
  "#0a7aff", "#ff9500", "#2fb450", "#af52de", "#1fa3c4",
  "#ff2d6f", "#5e5ce6", "#a2845e", "#00b5a0", "#e0a100",
];

type Row = {
  date: string;
  balances: Record<string, number | undefined>;
  total: number;
};

export function BalancesClient({
  accounts,
  initialSnapshots,
}: {
  accounts: Account[];
  initialSnapshots: Snapshot[];
}) {
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [date, setDate] = useState(todayISO());
  const [range, setRange] = useState<ChartRange>("3M");
  const [fromDate, setFromDate] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set(["__total"]));

  function mergeSaved(saved: Snapshot[]) {
    // Snapshots are append-only now — several can share a day (e.g. a 6am
    // check-in and a 7pm Forecast update), so newly saved ones are just
    // added on, never replacing same-day entries.
    setSnapshots((prev) => [...prev, ...saved]);
  }

  const lastKnown = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of [...snapshots].sort((a, b) => {
      if (a.as_of_date !== b.as_of_date) return a.as_of_date < b.as_of_date ? -1 : 1;
      return a.created_at < b.created_at ? -1 : 1;
    })) {
      map.set(s.account_id, s.balance);
    }
    return map;
  }, [snapshots]);

  const rows = useMemo<Row[]>(() => {
    const dates = Array.from(new Set(snapshots.map((s) => s.as_of_date))).sort();
    const byAccountDate = new Map<string, Map<string, number>>();
    for (const s of snapshots) {
      if (!byAccountDate.has(s.account_id)) {
        byAccountDate.set(s.account_id, new Map());
      }
      byAccountDate.get(s.account_id)!.set(s.as_of_date, s.balance);
    }

    return dates.reduce<{ rows: Row[]; known: Record<string, number> }>(
      (acc, d) => {
        const known = { ...acc.known };
        for (const account of accounts) {
          const v = byAccountDate.get(account.id)?.get(d);
          if (v !== undefined) known[account.id] = v;
        }
        const total = accounts.reduce(
          (sum, a) => sum + (known[a.id] ?? 0),
          0,
        );
        return { rows: [...acc.rows, { date: d, balances: known, total }], known };
      },
      { rows: [], known: {} },
    ).rows;
  }, [snapshots, accounts]);

  const displayRows = useMemo(() => [...rows].reverse(), [rows]);

  function diffFor(row: Row, targetDaysAgo: number | "start") {
    const idx = rows.findIndex((r) => r.date === row.date);
    if (idx <= 0) return null;
    if (targetDaysAgo === "start") {
      return row.total - rows[0].total;
    }
    let compareIdx = 0;
    for (let i = idx - 1; i >= 0; i--) {
      if (daysBetween(rows[i].date, row.date) >= targetDaysAgo) {
        compareIdx = i;
        break;
      }
    }
    if (compareIdx === idx) return null;
    return row.total - rows[compareIdx].total;
  }

  // One line per account (plus a Total), within the chosen date range.
  // Each account's line starts at its first recorded balance, and is held
  // flat to today so it reaches the right-hand edge.
  const chartSeries = useMemo<Series[]>(() => {
    if (rows.length === 0) return [];
    const today = todayISO();
    const from = rangeStart(range, fromDate, today);
    const build = (
      id: string,
      name: string,
      color: string,
      value: (r: Row) => number | undefined,
    ): Series | null => {
      const full = rows
        .map((r) => ({ date: r.date, value: value(r) }))
        .filter((p): p is { date: string; value: number } => p.value !== undefined);
      if (full.length === 0) return null;
      if (full[full.length - 1].date < today) {
        full.push({ date: today, value: full[full.length - 1].value });
      }
      const inRange = full.filter((p) => p.date >= from);
      const before = [...full].reverse().find((p) => p.date < from);
      const points =
        from && before && inRange[0]?.date !== from
          ? [{ date: from, value: before.value }, ...inRange]
          : inRange;
      return points.length > 0 ? { id, name, color, points } : null;
    };
    const lines = accounts
      .filter((a) => !hidden.has(a.id))
      .map((a) =>
        build(a.id, a.name, SERIES_COLORS[accounts.indexOf(a) % SERIES_COLORS.length], (r) =>
          r.balances[a.id],
        ),
      );
    const total = hidden.has("__total")
      ? null
      : build("__total", "Total", "var(--foreground)", (r) => r.total);
    return [...lines, total].filter((x): x is Series => x !== null);
  }, [rows, accounts, hidden, range, fromDate]);

  function toggleSeries(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const latestTotal = rows.length > 0 ? rows[rows.length - 1].total : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Balances</h1>
        <p className="text-sm text-muted">
          Net worth: {currency.format(latestTotal)}
        </p>
      </div>

      <DailyEntryForm
        accounts={accounts}
        date={date}
        onDateChange={setDate}
        lastKnown={lastKnown}
        onSaved={mergeSaved}
      />

      <div className="space-y-3">
        <MultiLineChart
          series={chartSeries}
          valueLabel="Balances over time"
          controls={
            <ChartRangeControls
              range={range}
              onRange={setRange}
              fromDate={fromDate}
              onFromDate={setFromDate}
              today={todayISO()}
            />
          }
        />
        <div className="flex flex-wrap gap-2">
          {[
            ...accounts.map((a, i) => ({
              id: a.id,
              name: a.name,
              color: SERIES_COLORS[i % SERIES_COLORS.length],
            })),
            { id: "__total", name: "Total", color: "var(--foreground)" },
          ].map((c) => {
            const on = !hidden.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleSeries(c.id)}
                aria-pressed={on}
                className={`flex items-center gap-1.5 border px-3 py-1 text-xs transition-colors ${
                  on ? "border-hairline" : "border-hairline text-muted opacity-60"
                }`}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: on ? c.color : "transparent", boxShadow: `inset 0 0 0 1px ${c.color}` }}
                />
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-hairline shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-muted">
              <th className="px-3 py-2 font-normal">Date</th>
              {accounts.map((a) => (
                <th key={a.id} className="px-3 py-2 text-right font-normal">
                  {a.name}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-normal">Total</th>
              <th className="px-3 py-2 text-right font-normal">Yesterday</th>
              <th className="px-3 py-2 text-right font-normal">Last week</th>
              <th className="px-3 py-2 text-right font-normal">Since start</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => {
              const diffDay = diffFor(row, 1);
              const diffWeek = diffFor(row, 7);
              const diffStart = diffFor(row, "start");
              return (
                <tr
                  key={row.date}
                  className="border-b border-hairline last:border-0"
                >
                  <td className="px-3 py-2 tabular-nums">{formatDate(row.date)}</td>
                  {accounts.map((a) => {
                    const v = row.balances[a.id];
                    return (
                      <td
                        key={a.id}
                        className={`px-3 py-2 text-right tabular-nums ${
                          v !== undefined && v < 0 ? "text-red-500" : ""
                        }`}
                      >
                        {v !== undefined ? currency.format(v) : "—"}
                      </td>
                    );
                  })}
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-medium ${
                      row.total < 0 ? "text-red-500" : ""
                    }`}
                  >
                    {currency.format(row.total)}
                  </td>
                  <DiffCell value={diffDay} />
                  <DiffCell value={diffWeek} />
                  <DiffCell value={diffStart} />
                </tr>
              );
            })}
            {displayRows.length === 0 && (
              <tr>
                <td
                  colSpan={accounts.length + 5}
                  className="px-3 py-6 text-center text-foreground/40"
                >
                  No balances logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DiffCell({ value }: { value: number | null }) {
  if (value === null) {
    return <td className="px-3 py-2 text-right text-foreground/30">—</td>;
  }
  const positive = value > 0;
  const negative = value < 0;
  return (
    <td
      className={`px-3 py-2 text-right tabular-nums ${
        positive
          ? "text-emerald-600 dark:text-emerald-400"
          : negative
            ? "text-red-500"
            : "text-muted"
      }`}
    >
      {value >= 0 ? "+" : "-"}
      {currency.format(Math.abs(value))}
    </td>
  );
}

function DailyEntryForm({
  accounts,
  date,
  onDateChange,
  lastKnown,
  onSaved,
}: {
  accounts: Account[];
  date: string;
  onDateChange: (date: string) => void;
  lastKnown: Map<string, number>;
  onSaved: (saved: Snapshot[]) => void;
}) {
  const [state, formAction, pending] = useActionState<
    SaveBalancesState,
    FormData
  >(saveDailyBalances, undefined);

  useEffect(() => {
    if (state?.saved) onSaved(state.saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-hairline shadow-card p-4"
    >
      <div className="flex items-center gap-3">
        <label className="text-xs text-muted">Date</label>
        <input
          name="date"
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          required
          className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm outline-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {accounts.map((a) => (
          <div key={a.id}>
            <label className="mb-1 block text-xs text-muted">
              {a.name}
              {a.is_liability ? " (owed)" : ""}
            </label>
            <input
              name={`balance_${a.id}`}
              type="number"
              step="0.01"
              placeholder={
                lastKnown.has(a.id)
                  ? currency.format(Math.abs(lastKnown.get(a.id)!))
                  : "€0.00"
              }
              className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm outline-none"
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-foreground/40">
        Leave an account blank to keep its last known balance — only enter
        what changed. For accounts marked &ldquo;owed&rdquo;, just type the
        amount you owe — no minus sign needed.
      </p>
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save balances"}
      </button>
    </form>
  );
}
