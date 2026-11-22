"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import {
  archiveAccount,
  createAccount,
  updateAccount,
  type AccountFormState,
  type SavedAccount,
  type SavedValue,
} from "./actions";
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

export function NetWorthClient({
  initialAccounts,
  initialSnapshots,
}: {
  initialAccounts: Account[];
  initialSnapshots: Snapshot[];
}) {
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
  const netWorth = totalAssets + totalLiabilities;

  // Net worth over time: on each date a balance was recorded, sum every
  // account's most recent balance up to then (liabilities are negative).
  const chartPoints = useMemo<ChartPoint[]>(() => {
    const today = todayISO();
    const sorted = [...snapshots].sort((a, b) => {
      if (a.as_of_date !== b.as_of_date) return a.as_of_date < b.as_of_date ? -1 : 1;
      return a.created_at < b.created_at ? -1 : 1;
    });
    const balances = new Map<string, number>();
    const series: ChartPoint[] = [];
    for (let i = 0; i < sorted.length; i++) {
      balances.set(sorted[i].account_id, sorted[i].balance);
      const isLastOfDate =
        i === sorted.length - 1 || sorted[i + 1].as_of_date !== sorted[i].as_of_date;
      if (!isLastOfDate) continue;
      let total = 0;
      for (const v of balances.values()) total += v;
      series.push({ date: sorted[i].as_of_date, value: total, label: "Recorded" });
    }
    if (series.length === 0) return [];
    const last = series[series.length - 1];
    if (last.date < today) series.push({ date: today, value: last.value, label: "Today" });

    const from = rangeStart(range, fromDate, today);
    if (!from) return series;
    const inRange = series.filter((p) => p.date >= from);
    // Anchor the line at the start of the window with the value then.
    const before = [...series].reverse().find((p) => p.date < from);
    return before && inRange[0]?.date !== from
      ? [{ date: from, value: before.value, label: "Recorded" }, ...inRange]
      : inRange;
  }, [snapshots, range, fromDate]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Net Worth</h1>
          <p
            className={`text-lg font-medium tabular-nums ${netWorth < 0 ? "text-red-500" : ""}`}
          >
            {currency.format(netWorth)}
          </p>
        </div>
        <button
          onClick={() => setEditingAccount("new")}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          Add account
        </button>
      </div>

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
