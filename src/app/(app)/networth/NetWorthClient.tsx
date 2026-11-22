"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import {
  archiveAccount,
  createAccount,
  updateAccount,
  type AccountFormState,
  type SavedAccount,
  type SavedValue,
  importNetWorthHistory,
} from "./actions";
import { saveDailyBalances, type SaveBalancesState } from "../balances/actions";
import { parseHistory } from "@/lib/parse-history";
import {
  BalanceChart,
  ChartRangeControls,
  rangeStart,
  type ChartPoint,
  type ChartRange,
} from "@/components/BalanceChart";

type Account = SavedAccount;
type Snapshot = SavedValue;

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

const CATEGORY_SUGGESTIONS = [
  "Bank",
  "Property",
  "Vehicle",
  "Pension",
  "Investment",
  "Mortgage",
  "Institutional debt",
  "Personal loans",
  "Other",
];

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

type Entry = { date: string; value: number; imported: boolean };

function compact(n: number) {
  const abs = Math.abs(n);
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`;
  return `${sign}${Math.round(abs)}`;
}

function percent(cur: number, prev: number) {
  if (prev === 0) return "—";
  const p = ((cur - prev) / Math.abs(prev)) * 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
}

export function NetWorthClient({
  initialAccounts,
  initialSnapshots,
  initialHistory,
}: {
  initialAccounts: Account[];
  initialSnapshots: Snapshot[];
  initialHistory: Array<{ as_of_date: string; total: number }>;
}) {
  const [history, setHistory] = useState(initialHistory);
  const [unit, setUnit] = useState<"eur" | "pct">("eur");
  const [newEntryOpen, setNewEntryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [editingAccount, setEditingAccount] = useState<Account | "new" | null>(
    null,
  );
  const [, startTransition] = useTransition();
  const [range, setRange] = useState<ChartRange>("1Y");
  const [fromDate, setFromDate] = useState("");

  const latest = useMemo(() => {
    const map = new Map<string, Snapshot>();
    for (const s of [...snapshots].sort((a, b) => {
      if (a.as_of_date !== b.as_of_date) return a.as_of_date < b.as_of_date ? -1 : 1;
      return a.created_at < b.created_at ? -1 : 1;
    })) {
      map.set(s.account_id, s);
    }
    return map;
  }, [snapshots]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, Account[]>();
    for (const a of accounts) {
      const label = a.group_label?.trim() || "Other";
      const list = byGroup.get(label) ?? [];
      list.push(a);
      byGroup.set(label, list);
    }
    return Array.from(byGroup.entries())
      .map(([label, list]) => ({
        label,
        isLiability: list[0]?.is_liability ?? false,
        accounts: list.sort((a, b) => a.name.localeCompare(b.name)),
        total: list.reduce((sum, a) => sum + (latest.get(a.id)?.balance ?? 0), 0),
      }))
      .sort((a, b) => Number(a.isLiability) - Number(b.isLiability));
  }, [accounts, latest]);

  const totalAssets = groups
    .filter((g) => !g.isLiability)
    .reduce((sum, g) => sum + g.total, 0);
  const totalLiabilities = groups
    .filter((g) => g.isLiability)
    .reduce((sum, g) => sum + g.total, 0);

  // Every net-worth data point: imported totals for dates before any
  // balances were recorded here, then — on each date a balance was
  // recorded — the sum of every account's most recent balance up to then
  // (liabilities are negative).
  const series = useMemo<Entry[]>(() => {
    const sorted = [...snapshots].sort((a, b) => {
      if (a.as_of_date !== b.as_of_date) return a.as_of_date < b.as_of_date ? -1 : 1;
      return a.created_at < b.created_at ? -1 : 1;
    });
    const balances = new Map<string, number>();
    const computed: Entry[] = [];
    for (let i = 0; i < sorted.length; i++) {
      balances.set(sorted[i].account_id, sorted[i].balance);
      const lastOfDate =
        i === sorted.length - 1 || sorted[i + 1].as_of_date !== sorted[i].as_of_date;
      if (!lastOfDate) continue;
      let total = 0;
      for (const v of balances.values()) total += v;
      computed.push({ date: sorted[i].as_of_date, value: total, imported: false });
    }
    const firstComputed = computed[0]?.date;
    const imported = history
      .filter((h) => !firstComputed || h.as_of_date < firstComputed)
      .map((h) => ({ date: h.as_of_date, value: Number(h.total), imported: true }));
    return [...imported, ...computed].sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [snapshots, history]);

  const chartPoints = useMemo<ChartPoint[]>(() => {
    const today = todayISO();
    if (series.length === 0) return [];
    const all: ChartPoint[] = series.map((e) => ({
      date: e.date,
      value: e.value,
      label: e.imported ? "Imported" : "Recorded",
    }));
    const last = all[all.length - 1];
    if (last.date < today) all.push({ date: today, value: last.value, label: "Today" });

    const from = rangeStart(range, fromDate, today);
    if (!from) return all;
    const inRange = all.filter((p) => p.date >= from);
    const before = [...all].reverse().find((p) => p.date < from);
    return before && inRange[0]?.date !== from
      ? [{ date: from, value: before.value, label: before.label }, ...inRange]
      : inRange;
  }, [series, range, fromDate]);

  // Timeline: one entry per month (the last data point in it), newest
  // first, each with its change from the previous month's entry.
  const timeline = useMemo(() => {
    const byMonth = new Map<string, Entry>();
    for (const e of series) byMonth.set(e.date.slice(0, 7), e);
    const asc = Array.from(byMonth.values());
    return asc
      .map((e, i) => ({ ...e, prev: i > 0 ? asc[i - 1].value : null }))
      .reverse();
  }, [series]);

  const latestEntry = timeline[0];

  // Per-account balances as of a date (only for dates with recorded balances).
  function breakdownAt(date: string) {
    const known = new Map<string, number>();
    for (const sn of [...snapshots].sort((a, b) => {
      if (a.as_of_date !== b.as_of_date) return a.as_of_date < b.as_of_date ? -1 : 1;
      return a.created_at < b.created_at ? -1 : 1;
    })) {
      if (sn.as_of_date <= date) known.set(sn.account_id, sn.balance);
    }
    return accounts
      .map((a) => ({ account: a, balance: known.get(a.id) }))
      .filter((r) => r.balance !== undefined) as Array<{ account: Account; balance: number }>;
  }

  function upsertLocal(account: Account, snapshot: Snapshot) {
    setAccounts((prev) => {
      const exists = prev.some((a) => a.id === account.id);
      return exists
        ? prev.map((a) => (a.id === account.id ? account : a))
        : [...prev, account];
    });
    setSnapshots((prev) => [...prev, snapshot]);
  }

  function handleArchive(account: Account) {
    if (!confirm(`Archive "${account.name}"? It'll drop off this page.`)) return;
    setAccounts((prev) => prev.filter((a) => a.id !== account.id));
    startTransition(() => {
      archiveAccount(account.id);
    });
  }

  function delta(e: { value: number; prev: number | null }) {
    if (e.prev === null) return null;
    return unit === "eur" ? compact(e.value - e.prev) : percent(e.value, e.prev);
  }
  const badge = (e: { value: number; prev: number | null }) => {
    const text = delta(e);
    if (text === null) return null;
    const up = e.value - (e.prev ?? 0) >= 0;
    return (
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${
          up
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-red-500/10 text-red-500"
        }`}
      >
        {text}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Net Worth</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditingAccount("new")}
            className="rounded-md border border-accent/30 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/10"
          >
            Add account
          </button>
          <button
            onClick={() => setNewEntryOpen(true)}
            disabled={accounts.length === 0}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            New entry
          </button>
        </div>
      </div>

      {latestEntry && (
        <div className="rounded-[22px] bg-accent p-5 text-white shadow-card">
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm opacity-80">
              {formatDate(latestEntry.date)} · Latest net worth
            </span>
            <div className="flex items-center gap-1 rounded-full bg-white/15 p-0.5 text-xs">
              {(["eur", "pct"] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className={`rounded-full px-2.5 py-0.5 transition-colors ${
                    unit === u ? "bg-white text-accent" : "text-white/80"
                  }`}
                >
                  {u === "eur" ? "€" : "%"}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 text-4xl font-semibold tabular-nums">
            {currency.format(latestEntry.value)}
          </div>
          {latestEntry.prev !== null && (
            <div className="mt-1 text-sm opacity-80">
              {unit === "eur"
                ? `${compact(latestEntry.value - latestEntry.prev)} since last entry`
                : `${percent(latestEntry.value, latestEntry.prev)} since last entry`}
            </div>
          )}
        </div>
      )}

      <BalanceChart
        points={chartPoints}
        valueLabel="Net worth over time"
        controls={
          <ChartRangeControls
            range={range}
            onRange={setRange}
            fromDate={fromDate}
            onFromDate={setFromDate}
            today={todayISO()}
          />
        }
        reference={
          chartPoints.some((p) => p.value < 0) ? { value: 0, label: "Zero" } : undefined
        }
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted">History</h2>
          <button
            onClick={() => setImportOpen(true)}
            className="text-xs text-muted transition-colors hover:text-accent"
          >
            Import history
          </button>
        </div>
        {timeline.length === 0 ? (
          <p className="rounded-lg border border-hairline px-4 py-6 text-center text-sm text-foreground/40 shadow-card">
            No entries yet — tap New entry, or import your history.
          </p>
        ) : (
          <div className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline shadow-card">
            {timeline.map((e) => {
              const open = openDate === e.date;
              const rows = open && !e.imported ? breakdownAt(e.date) : [];
              return (
                <div key={e.date}>
                  <button
                    onClick={() => setOpenDate(open ? null : e.date)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface"
                  >
                    <span className="flex flex-col">
                      <span className="text-sm text-accent">{formatDate(e.date)}</span>
                      <span
                        className={`text-xl font-medium tabular-nums ${
                          e.value < 0 ? "text-red-500" : ""
                        }`}
                      >
                        {currency.format(e.value)}
                      </span>
                    </span>
                    {badge(e)}
                  </button>
                  {open && (
                    <div className="space-y-1 bg-surface px-4 py-3 text-sm">
                      {e.imported ? (
                        <p className="text-muted">
                          Imported total — no per-account breakdown for this date.
                        </p>
                      ) : (
                        rows.map((r) => (
                          <p key={r.account.id} className="flex justify-between gap-4">
                            <span className="text-muted">{r.account.name}</span>
                            <span
                              className={`tabular-nums ${r.balance < 0 ? "text-red-500" : ""}`}
                            >
                              {currency.format(r.balance)}
                            </span>
                          </p>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <h2 className="pt-2 text-sm font-medium text-muted">Accounts</h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-hairline shadow-card p-4">
          <div className="text-xs text-muted">Assets</div>
          <div className="text-lg font-medium tabular-nums">
            {currency.format(totalAssets)}
          </div>
        </div>
        <div className="rounded-lg border border-hairline shadow-card p-4">
          <div className="text-xs text-muted">Liabilities (owed)</div>
          <div className="text-lg font-medium tabular-nums text-red-500">
            {currency.format(Math.abs(totalLiabilities))}
          </div>
        </div>
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-muted">
          No accounts yet. Add your bank accounts, property, vehicles,
          pensions — anything you own or owe.
        </p>
      )}

      {groups.map((group) => (
        <div key={group.label} className="overflow-hidden rounded-lg border border-hairline shadow-card">
          <div className="flex items-center justify-between border-b border-hairline bg-surface px-4 py-2">
            <span className="text-sm font-medium">{group.label}</span>
            <span
              className={`text-sm tabular-nums ${group.isLiability ? "text-red-500" : ""}`}
            >
              {group.isLiability
                ? `-${currency.format(Math.abs(group.total))}`
                : currency.format(group.total)}
            </span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {group.accounts.map((account) => {
                const snapshot = latest.get(account.id);
                return (
                  <tr
                    key={account.id}
                    className="border-b border-hairline last:border-0"
                  >
                    <td className="px-4 py-2">{account.name}</td>
                    <td className="px-4 py-2 text-xs text-foreground/40">
                      {snapshot ? `as of ${formatDate(snapshot.as_of_date)}` : "no value yet"}
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums font-medium ${
                        snapshot && snapshot.balance < 0 ? "text-red-500" : ""
                      }`}
                    >
                      {snapshot ? currency.format(snapshot.balance) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditingAccount(account)}
                        className="mr-3 text-xs text-muted transition-colors hover:text-accent"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleArchive(account)}
                        className="text-xs text-red-500 transition-colors hover:text-red-400"
                      >
                        Archive
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {newEntryOpen && (
        <NewEntryModal
          accounts={accounts}
          latest={latest}
          onClose={() => setNewEntryOpen(false)}
          onSaved={(saved) => {
            setSnapshots((prev) => [...prev, ...(saved as Snapshot[])]);
            setNewEntryOpen(false);
          }}
        />
      )}

      {importOpen && (
        <ImportHistoryModal
          onClose={() => setImportOpen(false)}
          onImported={(rows) => {
            setHistory((prev) => {
              const map = new Map(prev.map((h) => [h.as_of_date, h.total]));
              for (const r of rows) map.set(r.date, r.total);
              return Array.from(map, ([as_of_date, total]) => ({ as_of_date, total })).sort(
                (a, b) => (a.as_of_date < b.as_of_date ? -1 : 1),
              );
            });
            setImportOpen(false);
          }}
        />
      )}

      {editingAccount && (
        <AccountFormModal
          account={editingAccount === "new" ? null : editingAccount}
          latestBalance={
            editingAccount !== "new" ? latest.get(editingAccount.id) : undefined
          }
          onClose={() => setEditingAccount(null)}
          onSaved={(account, snapshot) => {
            upsertLocal(account, snapshot);
            setEditingAccount(null);
          }}
        />
      )}
    </div>
  );
}

function AccountFormModal({
  account,
  latestBalance,
  onClose,
  onSaved,
}: {
  account: Account | null;
  latestBalance: Snapshot | undefined;
  onClose: () => void;
  onSaved: (account: Account, snapshot: Snapshot) => void;
}) {
  const isNew = !account;
  const action = isNew ? createAccount : updateAccount.bind(null, account!.id);
  const [state, formAction, pending] = useActionState<AccountFormState, FormData>(
    action,
    undefined,
  );
  const [isLiability, setIsLiability] = useState(account?.is_liability ?? false);

  useEffect(() => {
    if (state?.account && state?.snapshot) onSaved(state.account, state.snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-[20px] border border-hairline bg-background p-5 shadow-xl">
        <h2 className="mb-4 font-medium">{isNew ? "Add account" : "Edit account"}</h2>
        <form action={formAction} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Name</label>
            <input
              name="name"
              defaultValue={account?.name}
              placeholder="e.g. House, Car, Pension"
              required
              className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Category</label>
            <input
              name="group_label"
              list="category-suggestions"
              defaultValue={account?.group_label ?? ""}
              placeholder="e.g. Property"
              required
              className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm outline-none"
            />
            <datalist id="category-suggestions">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_liability"
              checked={isLiability}
              onChange={(e) => setIsLiability(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            This is something owed (a debt), not something owned
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">
                {isLiability ? "Amount owed (€)" : "Current value (€)"}
              </label>
              <input
                name="balance"
                type="number"
                step="0.01"
                min="0"
                defaultValue={
                  latestBalance ? Math.abs(latestBalance.balance) : undefined
                }
                required
                className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">As of</label>
              <input
                name="as_of_date"
                type="date"
                defaultValue={todayISO()}
                required
                className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm outline-none"
              />
            </div>
          </div>
          {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-accent/30 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewEntryModal({
  accounts,
  latest,
  onClose,
  onSaved,
}: {
  accounts: Account[];
  latest: Map<string, Snapshot>;
  onClose: () => void;
  onSaved: (saved: Array<{ account_id: string; as_of_date: string; balance: number; created_at: string }>) => void;
}) {
  const [state, formAction, pending] = useActionState<SaveBalancesState, FormData>(
    saveDailyBalances,
    undefined,
  );

  useEffect(() => {
    if (state?.saved) onSaved(state.saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const ordered = [...accounts].sort(
    (a, b) => Number(a.is_liability) - Number(b.is_liability) || a.name.localeCompare(b.name),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[20px] border border-hairline bg-background p-5 shadow-xl">
        <h2 className="mb-1 font-medium">New entry</h2>
        <p className="mb-4 text-xs text-muted">
          Starts from your latest figures — change what moved and save. Debts: type the amount
          you owe, no minus sign.
        </p>
        <form action={formAction} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Date</label>
            <input
              name="date"
              type="date"
              defaultValue={todayISO()}
              required
              className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm outline-none"
            />
          </div>
          {ordered.map((a) => {
            const last = latest.get(a.id)?.balance;
            return (
              <div key={a.id}>
                <label className="mb-1 block text-xs text-muted">
                  {a.name}
                  {a.is_liability ? " (owed)" : ""}
                </label>
                <input
                  name={`balance_${a.id}`}
                  type="number"
                  step="0.01"
                  defaultValue={last !== undefined ? (a.is_liability ? Math.abs(last) : last) : undefined}
                  className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm outline-none"
                />
              </div>
            );
          })}
          {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-accent/30 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportHistoryModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (rows: Array<{ date: string; total: number }>) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const parsed = useMemo(() => parseHistory(text), [text]);

  function handleImport() {
    setError(null);
    startTransition(async () => {
      const result = await importNetWorthHistory(parsed.rows);
      if (result.error) setError(result.error);
      else onImported(parsed.rows);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-[20px] border border-hairline bg-background p-5 shadow-xl">
        <h2 className="mb-1 font-medium">Import history</h2>
        <p className="mb-3 text-xs text-muted">
          Paste one entry per line: a date and the net worth, e.g.{" "}
          <span className="font-mono">2015-10-28, -54969</span> or{" "}
          <span className="font-mono">Oct 28, 2015  -54,969</span>. Re-importing a date
          replaces it.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"2015-10-28, -54969\n2015-12-13, -48237"}
          className="w-full rounded-md border border-hairline bg-surface px-3 py-2 font-mono text-xs outline-none"
        />
        <p className="mt-2 text-xs text-muted">
          {parsed.rows.length} entr{parsed.rows.length === 1 ? "y" : "ies"} found
          {parsed.skipped > 0 ? ` · ${parsed.skipped} line(s) skipped` : ""}
          {parsed.rows.length > 0
            ? ` · ${parsed.rows[0].date} → ${parsed.rows[parsed.rows.length - 1].date}`
            : ""}
        </p>
        {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-accent/30 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/10"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={pending || parsed.rows.length === 0}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {pending ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
