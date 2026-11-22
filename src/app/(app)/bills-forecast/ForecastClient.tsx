"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  addTransaction,
  clearTransaction,
  deleteAllFutureOccurrences,
  deleteOccurrenceOnly,
  deleteTransaction,
  pauseBillFromForecast,
  removeBillEntirely,
  setCreditLimit,
  setTransactionStatus,
  updateTransaction,
  type SavedTransaction,
  type TxFormState,
} from "./actions";
import { reconcileBalance, type LeftoverEntry } from "./reconcile";
import { FREQUENCIES, FREQUENCY_LABELS, type Frequency } from "@/lib/recurrence";
import { CalendarGrid, type CalendarEntry } from "@/components/CalendarGrid";
import { ChoiceModal } from "@/components/ChoiceModal";
import { BalanceChart, type ChartPoint } from "@/components/BalanceChart";

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
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

function formatSignedAmount(amount: number) {
  const formatted = currency.format(Math.abs(amount));
  return amount >= 0 ? `+${formatted}` : `-${formatted}`;
}

// Compact date for mobile section headers — the year rarely matters for a
// 90-day-out forecast, and the weekday helps at a glance.
function formatDateShort(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

const HORIZON_DAYS = 90;

function formatPayoff(days: number | null, owed: number) {
  if (owed <= 0) return "Nothing owed";
  if (days === null) return "Not at this pace";
  if (days > 3650) return "More than 10 years";
  const d = new Date(Date.now() + days * 86_400_000);
  return `~${d.toLocaleDateString("en-IE", { month: "short", year: "numeric" })}`;
}

export function ForecastClient({
  variant = "bills",
  title = "Bills Forecast",
  creditLimit = null,
  paymentSourceAccountId = null,
  paymentTargetAccountId = null,
  balanceHistory = [],
  selectedAccountId,
  startingBalance,
  startingBalanceDate,
  initialTransactions,
  existingCategories,
}: {
  variant?: "bills" | "card";
  title?: string;
  creditLimit?: number | null;
  paymentSourceAccountId?: string | null;
  paymentTargetAccountId?: string | null;
  balanceHistory?: Array<{ as_of_date: string; balance: number }>;
  selectedAccountId: string;
  startingBalance: number;
  startingBalanceDate: string | null;
  initialTransactions: SavedTransaction[];
  existingCategories: string[];
}) {
  const router = useRouter();
  const [transactions, setTransactions] = useState(initialTransactions);
  const [currentBalance, setCurrentBalance] = useState(startingBalance);
  const [currentBalanceDate, setCurrentBalanceDate] = useState(startingBalanceDate);
  const [editingTx, setEditingTx] = useState<SavedTransaction | "new" | null>(
    null,
  );
  const [deleteFlow, setDeleteFlow] = useState<
    | { step: "choose"; tx: SavedTransaction }
    | { step: "confirmBill"; recurringRuleId: string }
    | null
  >(null);
  const [pendingNewBalance, setPendingNewBalance] = useState<number | null>(null);
  const [range, setRange] = useState<"1M" | "3M" | "6M" | "1Y" | "All">("3M");
  const [fromDate, setFromDate] = useState("");
  const [editingLimit, setEditingLimit] = useState(false);
  const [limitInput, setLimitInput] = useState("");
  const [rowActionTx, setRowActionTx] = useState<SavedTransaction | null>(null);
  const [isPending, startTransition] = useTransition();
  const today = todayISO();
  const [view, setView] = useState<"list" | "calendar">("list");
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth() + 1);

  const planned = useMemo(
    () => transactions.filter((t) => t.status === "planned"),
    [transactions],
  );
  const onHold = useMemo(
    () => transactions.filter((t) => t.status === "on_hold"),
    [transactions],
  );

  const rows = useMemo(() => {
    const sorted = [...planned].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      // Same day: income lands before expenses, since it changes what the
      // rest of that day's balance actually looks like.
      const aIsIncome = a.amount >= 0 ? 0 : 1;
      const bIsIncome = b.amount >= 0 ? 0 : 1;
      return aIsIncome - bIsIncome;
    });
    return sorted.reduce<Array<SavedTransaction & { balance: number }>>(
      (acc, tx) => {
        const prevBalance =
          acc.length > 0 ? acc[acc.length - 1].balance : currentBalance;
        return [...acc, { ...tx, balance: prevBalance + tx.amount }];
      },
      [],
    );
  }, [planned, currentBalance]);

  const endingBalance = rows.length > 0 ? rows[rows.length - 1].balance : currentBalance;
  const isCard = variant === "card";
  // Bills: trouble is going below zero. Card: balance is what's owed
  // (negative), and trouble is owing more than the credit limit.
  const isBad = (balance: number) =>
    isCard ? creditLimit !== null && -balance > creditLimit : balance < 0;
  const firstNegative = rows.find((r) => isBad(r.balance));

  const cardSummary = useMemo(() => {
    if (!isCard) return null;
    const owed = Math.max(0, -currentBalance);
    const payments = rows.filter((r) => r.readOnly).reduce((s, r) => s + r.amount, 0);
    const net = rows.reduce((s, r) => s + r.amount, 0);
    // Average pace over the forecast window, extrapolated until it's repaid.
    const daysToClear = (perWindow: number) =>
      perWindow > 0 && owed > 0
        ? Math.ceil(owed / (perWindow / HORIZON_DAYS))
        : null;
    return {
      owed,
      owedIn90: Math.max(0, -endingBalance),
      available: creditLimit !== null ? creditLimit - owed : null,
      perWeek: payments / (HORIZON_DAYS / 7),
      payoffPaymentsOnly: daysToClear(payments),
      payoffWithPlanned: daysToClear(net),
    };
  }, [isCard, rows, currentBalance, endingBalance, creditLimit]);

  // Card: chart what's owed (so repaying brings the line down to zero).
  // Recorded balances give the history; planned entries the forecast.
  const chartPoints = useMemo<ChartPoint[]>(() => {
    const val = (b: number) => (isCard ? -b : b);
    const days = { "1M": 30, "3M": 90, "6M": 182, "1Y": 365, All: null }[range];
    let from = "";
    if (fromDate) from = fromDate;
    else if (days !== null) {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - days);
      from = d.toISOString().slice(0, 10);
    }
    const history: ChartPoint[] = balanceHistory
      .filter((h) => h.as_of_date < today && h.as_of_date >= from)
      .map((h) => ({ date: h.as_of_date, value: val(h.balance), label: "Recorded" }));
    return [
      ...history,
      { date: today, value: val(currentBalance), label: "Today" },
      ...rows.map((r) => ({
        date: r.date,
        value: val(r.balance),
        label: r.merchant,
        forecast: true,
      })),
    ];
  }, [isCard, rows, currentBalance, today, balanceHistory, range, fromDate]);

  // Mobile card view: same rows, grouped into consecutive same-day runs so
  // the date only needs to appear once per day instead of on every row.
  const dateGroups = useMemo(() => {
    return rows.reduce<Array<{ date: string; entries: typeof rows }>>((groups, tx) => {
      const last = groups[groups.length - 1];
      if (last && last.date === tx.date) {
        return [...groups.slice(0, -1), { date: last.date, entries: [...last.entries, tx] }];
      }
      return [...groups, { date: tx.date, entries: [tx] }];
    }, []);
  }, [rows]);

  const monthEntries = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    const monthPrefix = `${calendarYear}-${calendarMonth.toString().padStart(2, "0")}`;
    for (const tx of rows) {
      if (!tx.date.startsWith(monthPrefix)) continue;
      const list = map.get(tx.date) ?? [];
      list.push({ id: tx.id, label: tx.merchant ?? "", amount: tx.amount });
      map.set(tx.date, list);
    }
    return map;
  }, [rows, calendarYear, calendarMonth]);

  const monthNet = useMemo(() => {
    let total = 0;
    for (const list of monthEntries.values()) {
      for (const e of list) total += e.amount;
    }
    return total;
  }, [monthEntries]);

  function shiftMonth(delta: number) {
    let m = calendarMonth + delta;
    let y = calendarYear;
    if (m > 12) {
      m = 1;
      y += 1;
    } else if (m < 1) {
      m = 12;
      y -= 1;
    }
    setCalendarMonth(m);
    setCalendarYear(y);
  }

  function upsertLocal(tx: SavedTransaction) {
    setTransactions((prev) => {
      const exists = prev.some((t) => t.id === tx.id);
      return exists ? prev.map((t) => (t.id === tx.id ? tx : t)) : [...prev, tx];
    });
  }

  function handleDelete(tx: SavedTransaction) {
    if (!tx.recurring_rule_id) {
      if (!confirm("Delete this entry? This can't be undone.")) return;
      setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
      startTransition(() => {
        deleteTransaction(tx.id);
      });
      return;
    }
    // Recurring-linked entries need to know whether this is a one-off
    // removal or the whole bill's future occurrences.
    setDeleteFlow({ step: "choose", tx });
  }

  function handleDeleteJustThisOne(tx: SavedTransaction) {
    setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
    setDeleteFlow(null);
    startTransition(() => {
      deleteOccurrenceOnly(tx.id, tx.recurring_rule_id, tx.date);
    });
  }

  function handleDeleteAllOccurrences(tx: SavedTransaction) {
    const ruleId = tx.recurring_rule_id!;
    setTransactions((prev) => prev.filter((t) => t.recurring_rule_id !== ruleId));
    startTransition(() => {
      deleteAllFutureOccurrences(ruleId);
    });
    setDeleteFlow({ step: "confirmBill", recurringRuleId: ruleId });
  }

  function handleResolveBillRemoval(recurringRuleId: string, alsoDeleteBill: boolean) {
    setDeleteFlow(null);
    startTransition(async () => {
      if (alsoDeleteBill) {
        await removeBillEntirely(recurringRuleId);
      } else {
        await pauseBillFromForecast(recurringRuleId);
      }
      router.refresh();
    });
  }

  function handleClear(tx: SavedTransaction) {
    const newBalance = currentBalance + tx.amount;
    setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
    setCurrentBalance(newBalance);
    setCurrentBalanceDate(today);
    startTransition(() => {
      clearTransaction(tx.id, selectedAccountId, newBalance);
    });
  }

  function handleBringBack(id: string) {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "planned" } : t)),
    );
    startTransition(() => {
      setTransactionStatus(id, "planned");
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <button
          onClick={() => setEditingTx("new")}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          Add entry
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex shrink-0 items-center gap-1 rounded-full border border-hairline p-1 w-fit">
          <button
            onClick={() => setView("list")}
            className={`rounded px-3 py-1 text-sm transition-colors ${view === "list" ? "bg-accent text-white" : "text-muted hover:text-accent"}`}
          >
            List
          </button>
          <button
            onClick={() => setView("calendar")}
            className={`rounded px-3 py-1 text-sm transition-colors ${view === "calendar" ? "bg-accent text-white" : "text-muted hover:text-accent"}`}
          >
            Calendar
          </button>
        </div>
        {firstNegative ? (
          <div className="min-w-0 flex-1 truncate rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-500 sm:px-4 sm:text-sm">
            {isCard ? "⚠️ Over limit on " : "⚠️ Red on "}
            {formatDate(firstNegative.date)}
          </div>
        ) : isCard && creditLimit === null ? null : (
          <div className="min-w-0 flex-1 truncate rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-600 sm:px-4 sm:text-sm dark:text-emerald-400">
            {isCard ? "✅ Under limit for 90 days" : "✅ Clear for 90 days"}
          </div>
        )}
      </div>

      {cardSummary && (
        <div className="space-y-3 rounded-lg border border-hairline p-4 shadow-card">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted">Owed now</p>
              <p className="text-lg font-medium tabular-nums">
                {currency.format(cardSummary.owed)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Owed in 90 days</p>
              <p className="text-lg font-medium tabular-nums">
                {currency.format(cardSummary.owedIn90)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Paid per week</p>
              <p className="text-lg font-medium tabular-nums">
                {currency.format(cardSummary.perWeek)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Available</p>
              <p className="text-lg font-medium tabular-nums">
                {cardSummary.available !== null
                  ? currency.format(cardSummary.available)
                  : "—"}
              </p>
              {editingLimit ? (
                <form
                  className="mt-1 flex items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const value = limitInput.trim() === "" ? null : Number(limitInput);
                    if (value !== null && Number.isNaN(value)) return;
                    setEditingLimit(false);
                    startTransition(async () => {
                      await setCreditLimit(selectedAccountId, value);
                      router.refresh();
                    });
                  }}
                >
                  <input
                    type="number"
                    step="1"
                    min="0"
                    autoFocus
                    value={limitInput}
                    onChange={(e) => setLimitInput(e.target.value)}
                    placeholder="Limit €"
                    className="w-20 rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
                  />
                  <button type="submit" className="text-xs text-accent hover:underline">
                    Save
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => {
                    setLimitInput(creditLimit?.toString() ?? "");
                    setEditingLimit(true);
                  }}
                  className="text-xs text-muted transition-colors hover:text-accent"
                >
                  {creditLimit !== null
                    ? `Limit ${currency.format(creditLimit)} · edit`
                    : "Set limit"}
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1 border-t border-hairline pt-3 text-sm">
            <p className="flex justify-between gap-4">
              <span className="text-muted">Paid off at this rate, no new spending</span>
              <span className="font-medium">
                {formatPayoff(cardSummary.payoffPaymentsOnly, cardSummary.owed)}
              </span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted">Paid off including planned bills</span>
              <span className="font-medium">
                {formatPayoff(cardSummary.payoffWithPlanned, cardSummary.owed)}
              </span>
            </p>
          </div>
        </div>
      )}

      {view === "list" ? (
      <>
      <div className="space-y-4 sm:hidden">
        <div className="rounded-lg border border-hairline shadow-card px-3 py-2 text-sm text-muted">
          {currentBalanceDate
            ? `Balance as of ${formatDateShort(currentBalanceDate)}`
            : "Starting balance"}
          :{" "}
          <span className="font-medium text-foreground">
            {currency.format(currentBalance)}
          </span>
        </div>

        {dateGroups.map((group) => (
          <div key={group.date}>
            <div className="mb-1 px-1 text-xs font-medium text-foreground/50">
              {formatDateShort(group.date)}
            </div>
            <div className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline shadow-card">
              {group.entries.map((tx) => {
                const overdue = tx.date < today;
                return (
                  <button
                    key={tx.id}
                    onClick={() => !tx.readOnly && setRowActionTx(tx)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors active:bg-surface ${
                      overdue ? "bg-amber-500/5" : ""
                    }`}
                  >
                    <span className="truncate text-sm">{tx.merchant}</span>
                    <span className="flex shrink-0 flex-col items-end">
                      <span
                        className={`text-sm tabular-nums ${
                          tx.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : ""
                        }`}
                      >
                        {formatSignedAmount(tx.amount)}
                      </span>
                      <span
                        className={`text-xs tabular-nums font-medium ${
                          isBad(tx.balance) ? "text-red-500" : "text-foreground/50"
                        }`}
                      >
                        {currency.format(tx.balance)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-foreground/40">
            Nothing planned in the next 90 days.
          </p>
        )}

        {rows.length > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-hairline shadow-card px-3 py-2 text-sm font-medium">
            <span>Ending balance</span>
            <span className={isBad(endingBalance) ? "text-red-500" : ""}>
              {currency.format(endingBalance)}
            </span>
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-hairline shadow-card sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-muted">
              <th className="px-3 py-2 font-normal">Date</th>
              <th className="px-3 py-2 font-normal">Description</th>
              <th className="px-3 py-2 text-right font-normal">Amount</th>
              <th className="px-3 py-2 text-right font-normal">Balance</th>
              <th className="px-3 py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-hairline text-foreground/40">
              <td className="px-3 py-2" colSpan={3}>
                {currentBalanceDate
                  ? `Balance as of ${formatDate(currentBalanceDate)}`
                  : "Starting balance"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {currency.format(currentBalance)}
              </td>
              <td />
            </tr>
            {rows.map((tx) => {
              const overdue = tx.date < today;
              return (
                <tr
                  key={tx.id}
                  className={`border-b border-hairline last:border-0 ${
                    overdue ? "bg-amber-500/5" : ""
                  }`}
                >
                  <td className="px-3 py-2 tabular-nums">{formatDate(tx.date)}</td>
                  <td className="px-3 py-2">{tx.merchant}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      tx.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : ""
                    }`}
                  >
                    {formatSignedAmount(tx.amount)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-medium ${
                      isBad(tx.balance) ? "text-red-500" : ""
                    }`}
                  >
                    {currency.format(tx.balance)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {tx.readOnly ? (
                      <span className="text-xs text-muted">Edit in Monthly Bills</span>
                    ) : (
                    <>
                    <button
                      onClick={() => handleClear(tx)}
                      disabled={isPending}
                      className="mr-3 text-xs text-emerald-600 transition-colors hover:text-accent dark:text-emerald-400"
                    >
                      Mark cleared
                    </button>
                    <button
                      onClick={() => setEditingTx(tx)}
                      className="mr-3 text-xs text-muted transition-colors hover:text-accent"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(tx)}
                      className="text-xs text-red-500 transition-colors hover:text-red-400"
                    >
                      Delete
                    </button>
                    </>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-foreground/40">
                  Nothing planned in the next 90 days.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-hairline font-medium">
                <td className="px-3 py-2" colSpan={3}>
                  Ending balance
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    isBad(endingBalance) ? "text-red-500" : ""
                  }`}
                >
                  {currency.format(endingBalance)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => shiftMonth(-1)}
              className="rounded-md border border-accent/30 px-2 py-1 text-sm text-accent transition-colors hover:bg-accent/10"
            >
              ←
            </button>
            <div className="text-center">
              <div className="font-medium">
                {MONTH_NAMES[calendarMonth - 1]} {calendarYear}
              </div>
              <div
                className={`text-xs ${monthNet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted"}`}
              >
                {monthNet >= 0 ? "+" : "-"}
                {currency.format(Math.abs(monthNet))} net
              </div>
            </div>
            <button
              onClick={() => shiftMonth(1)}
              className="rounded-md border border-accent/30 px-2 py-1 text-sm text-accent transition-colors hover:bg-accent/10"
            >
              →
            </button>
          </div>
          <CalendarGrid
            year={calendarYear}
            month={calendarMonth}
            entries={monthEntries}
            onSelect={(id) => {
              const tx = rows.find((r) => r.id === id);
              if (tx && !tx.readOnly) setEditingTx(tx);
            }}
          />
        </div>
      )}

      <BalanceChart
        controls={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-hairline p-1">
              {(["1M", "3M", "6M", "1Y", "All"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setRange(r);
                    setFromDate("");
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
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
              />
            </label>
          </div>
        }
        points={chartPoints}
        valueLabel={isCard ? "Owed over time" : "Balance over time"}
        reference={
          isCard
            ? creditLimit !== null
              ? { value: creditLimit, label: "Credit limit" }
              : undefined
            : { value: 0, label: "Zero" }
        }
      />

      {onHold.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted">
            Set aside (not counted in the forecast)
          </h2>
          <div className="overflow-hidden rounded-lg border border-hairline shadow-card">
            <table className="w-full text-sm">
              <tbody>
                {onHold.map((tx) => (
                  <tr key={tx.id} className="border-b border-hairline last:border-0">
                    <td className="px-3 py-2 tabular-nums text-muted">
                      {formatDate(tx.date)}
                    </td>
                    <td className="px-3 py-2">{tx.merchant}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatSignedAmount(tx.amount)}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleBringBack(tx.id)}
                        className="mr-3 text-xs text-accent transition-colors hover:underline"
                      >
                        Bring back
                      </button>
                      <button
                        onClick={() => setEditingTx(tx)}
                        className="mr-3 text-xs text-muted transition-colors hover:text-accent"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(tx)}
                        className="text-xs text-red-500 transition-colors hover:text-red-400"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editingTx && (
        <TransactionFormModal
          tx={editingTx === "new" ? null : editingTx}
          accountId={selectedAccountId}
          currentBalance={currentBalance}
          isCard={isCard}
          paymentSourceAccountId={paymentSourceAccountId}
          paymentTargetAccountId={paymentTargetAccountId}
          onClose={() => setEditingTx(null)}
          onBalanceEntered={(balance) => {
            setEditingTx(null);
            setPendingNewBalance(balance);
          }}
          onSaved={(tx) => {
            upsertLocal(tx);
            setEditingTx(null);
          }}
          onRuleUpdated={(ruleId) => {
            setTransactions((prev) => prev.filter((t) => t.recurring_rule_id !== ruleId));
            setEditingTx(null);
            router.refresh();
          }}
        />
      )}

      {pendingNewBalance !== null && (
        <ReconcileModal
          accountId={selectedAccountId}
          oldBalance={currentBalance}
          newBalance={pendingNewBalance}
          candidates={planned.filter((t) => t.date <= today)}
          existingCategories={existingCategories}
          onCancel={() => setPendingNewBalance(null)}
          onDone={(snapshot, clearedIds) => {
            setCurrentBalance(snapshot.balance);
            setCurrentBalanceDate(snapshot.as_of_date);
            if (clearedIds.length > 0) {
              setTransactions((prev) => prev.filter((t) => !clearedIds.includes(t.id)));
            }
            setPendingNewBalance(null);
            router.refresh();
          }}
        />
      )}

      {rowActionTx && (
        <ChoiceModal
          title={rowActionTx.merchant ?? "Entry"}
          message={`${formatDate(rowActionTx.date)} · ${formatSignedAmount(rowActionTx.amount)}`}
          options={[
            {
              label: "Mark cleared",
              onClick: () => {
                handleClear(rowActionTx);
                setRowActionTx(null);
              },
            },
            {
              label: "Edit",
              onClick: () => {
                setEditingTx(rowActionTx);
                setRowActionTx(null);
              },
            },
            {
              label: "Delete",
              danger: true,
              onClick: () => {
                handleDelete(rowActionTx);
                setRowActionTx(null);
              },
            },
          ]}
          onCancel={() => setRowActionTx(null)}
        />
      )}

      {deleteFlow?.step === "choose" && (
        <ChoiceModal
          title="Delete this bill"
          message={`"${deleteFlow.tx.merchant}" repeats. Delete just this one, or every upcoming occurrence?`}
          options={[
            {
              label: "Just this occurrence",
              onClick: () => handleDeleteJustThisOne(deleteFlow.tx),
            },
            {
              label: "All occurrences",
              danger: true,
              onClick: () => handleDeleteAllOccurrences(deleteFlow.tx),
            },
          ]}
          onCancel={() => setDeleteFlow(null)}
        />
      )}

      {deleteFlow?.step === "confirmBill" && (
        <ChoiceModal
          title="Remove from Monthly Bills too?"
          message="It's cleared out of the forecast. Do you also want to delete the bill itself, or just pause it so it stops generating new occurrences but stays in Monthly Bills?"
          options={[
            {
              label: "Just pause it",
              onClick: () => handleResolveBillRemoval(deleteFlow.recurringRuleId, false),
            },
            {
              label: "Delete the bill too",
              danger: true,
              onClick: () => handleResolveBillRemoval(deleteFlow.recurringRuleId, true),
            },
          ]}
          onCancel={() => setDeleteFlow(null)}
        />
      )}
    </div>
  );
}

function ReconcileModal({
  accountId,
  oldBalance,
  newBalance,
  candidates,
  existingCategories,
  onCancel,
  onDone,
}: {
  accountId: string;
  oldBalance: number;
  newBalance: number;
  candidates: SavedTransaction[];
  existingCategories: string[];
  onCancel: () => void;
  onDone: (
    snapshot: { balance: number; as_of_date: string },
    clearedIds: string[],
  ) => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [leftovers, setLeftovers] = useState<LeftoverEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const diff = newBalance - oldBalance;
  const explainedByChecked = candidates
    .filter((c) => checked.has(c.id))
    .reduce((sum, c) => sum + c.amount, 0);
  const explainedByLeftovers = leftovers.reduce(
    (sum, l) => sum + (l.kind === "income" ? Math.abs(l.amount) : -Math.abs(l.amount)),
    0,
  );
  const remaining = diff - explainedByChecked - explainedByLeftovers;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateLeftover(index: number, patch: Partial<LeftoverEntry>) {
    setLeftovers((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLeftover() {
    setLeftovers((prev) => [
      ...prev,
      {
        amount: Math.round(Math.abs(remaining) * 100) / 100,
        kind: remaining >= 0 ? "income" : "expense",
        payee: "",
        category: "",
      },
    ]);
  }

  function removeLeftover(index: number) {
    setLeftovers((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await reconcileBalance(
      accountId,
      newBalance,
      Array.from(checked),
      leftovers.filter((l) => l.payee.trim() && l.amount !== 0),
    );
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onDone(result, Array.from(checked));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[20px] border border-hairline bg-background p-5 shadow-xl">
        <h2 className="mb-1 font-medium">
          Balance {diff >= 0 ? "up" : "down"} {currency.format(Math.abs(diff))}
        </h2>
        <p className="mb-4 text-sm text-muted">Did any of these already happen?</p>

        {candidates.length > 0 ? (
          <div className="mb-4 space-y-1">
            {candidates.map((tx) => (
              <label
                key={tx.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface"
              >
                <input
                  type="checkbox"
                  checked={checked.has(tx.id)}
                  onChange={() => toggle(tx.id)}
                  className="h-4 w-4 accent-accent"
                />
                <span className="flex-1 truncate">{tx.merchant}</span>
                <span className="tabular-nums text-muted">
                  {formatSignedAmount(tx.amount)}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="mb-4 text-sm text-foreground/40">Nothing due yet to check off.</p>
        )}

        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Anything else?</span>
          <button
            type="button"
            onClick={addLeftover}
            className="text-xs text-accent transition-colors hover:underline"
          >
            + Add
          </button>
        </div>

        {leftovers.length > 0 && (
          <div className="mb-4 space-y-3">
            {leftovers.map((item, i) => (
              <div key={i} className="rounded-lg border border-hairline shadow-card p-3">
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <select
                    value={item.kind}
                    onChange={(e) =>
                      updateLeftover(i, { kind: e.target.value as "income" | "expense" })
                    }
                    className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm outline-none"
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    value={item.amount || ""}
                    onChange={(e) => updateLeftover(i, { amount: Number(e.target.value) })}
                    placeholder="Amount (€)"
                    className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm outline-none"
                  />
                </div>
                <input
                  value={item.payee}
                  onChange={(e) => updateLeftover(i, { payee: e.target.value })}
                  placeholder="Payee / description"
                  className="mb-2 w-full rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm outline-none"
                />
                <div className="flex items-center gap-2">
                  <input
                    value={item.category}
                    onChange={(e) => updateLeftover(i, { category: e.target.value })}
                    list="reconcile-category-suggestions"
                    placeholder="Category (optional)"
                    className="w-full rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeLeftover(i)}
                    className="shrink-0 text-xs text-red-500 transition-colors hover:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <datalist id="reconcile-category-suggestions">
              {existingCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        )}

        <p
          className={`mb-4 text-sm ${
            Math.abs(remaining) < 0.005
              ? "text-foreground/40"
              : "text-amber-600 dark:text-amber-400"
          }`}
        >
          {Math.abs(remaining) < 0.005
            ? "Fully accounted for."
            : `Still unexplained: ${formatSignedAmount(remaining)}`}
        </p>

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-accent/30 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TransactionFormModal({
  tx,
  accountId,
  currentBalance,
  isCard,
  paymentSourceAccountId,
  paymentTargetAccountId,
  onClose,
  onBalanceEntered,
  onSaved,
  onRuleUpdated,
}: {
  tx: SavedTransaction | null;
  accountId: string;
  currentBalance: number;
  isCard: boolean;
  paymentSourceAccountId: string | null;
  paymentTargetAccountId: string | null;
  onClose: () => void;
  onBalanceEntered: (balance: number) => void;
  onSaved: (tx: SavedTransaction) => void;
  onRuleUpdated: (recurringRuleId: string) => void;
}) {
  const isNew = !tx;
  const isRecurring = !!tx?.recurring_rule_id;
  const [scope, setScope] = useState<"occurrence" | "rule">("occurrence");
  const [kind, setKind] = useState<"expense" | "income" | "balance" | "card_payment">(
    tx && tx.amount >= 0 ? "income" : "expense",
  );
  const isBalance = kind === "balance";
  const [repeat, setRepeat] = useState<"none" | Frequency>("none");
  const repeating = repeat !== "none";
  const [paidFromBills, setPaidFromBills] = useState(true);
  // A "linked" entry is paid from one account into another: on the card
  // page a Payment comes out of Bills (unless unticked); on Bills a Card
  // payment goes into the card. Either way it's stored on the paying
  // account and the card forecast reads it from there.
  const linkedFromBills =
    isNew && isCard && kind === "income" && paidFromBills && !!paymentSourceAccountId;
  const linkedToCard =
    isNew && !isCard && kind === "card_payment" && !!paymentTargetAccountId;
  const linked = linkedFromBills || linkedToCard;
  const sourceAccountId = linkedFromBills ? paymentSourceAccountId : accountId;
  const targetAccountId = linkedFromBills ? accountId : paymentTargetAccountId;
  const effectiveKind = linked ? "expense" : kind === "card_payment" ? "expense" : kind;
  const action = isNew ? addTransaction : updateTransaction.bind(null, tx!.id);
  const [state, formAction, pending] = useActionState<TxFormState, FormData>(
    action,
    undefined,
  );

  useEffect(() => {
    if (state?.transaction) onSaved(state.transaction);
    if (state?.ruleUpdated) onRuleUpdated(state.ruleUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-[20px] border border-hairline bg-background p-5 shadow-xl">
        <h2 className="mb-4 font-medium">{isNew ? "Add entry" : "Edit entry"}</h2>
        <form
          action={formAction}
          onSubmit={(e) => {
            if (!isBalance) return;
            // "Today's balance" isn't a transaction: hand it to the
            // reconcile flow instead of saving an entry.
            e.preventDefault();
            const entered = Number(
              new FormData(e.currentTarget).get("balance_amount"),
            );
            if (!Number.isNaN(entered)) onBalanceEntered(entered);
          }}
          className="space-y-3"
        >
          <input type="hidden" name="account_id" value={accountId} />
          <input type="hidden" name="kind" value={effectiveKind} />
          {linked && (
            <>
              <input type="hidden" name="rule_account_id" value={sourceAccountId ?? ""} />
              <input type="hidden" name="transfer_to_account_id" value={targetAccountId ?? ""} />
            </>
          )}
          {isRecurring && (
            <>
              <input type="hidden" name="recurring_rule_id" value={tx!.recurring_rule_id!} />
              <input type="hidden" name="original_date" value={tx!.date} />
              <input type="hidden" name="scope" value={scope} />
              <div className="rounded-lg border border-hairline shadow-card p-3">
                <p className="mb-2 text-xs text-muted">
                  This is a repeating bill. Apply this change to:
                </p>
                <label className="mb-1 flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={scope === "occurrence"}
                    onChange={() => setScope("occurrence")}
                    className="h-4 w-4 accent-accent"
                  />
                  Just this occurrence
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={scope === "rule"}
                    onChange={() => setScope("rule")}
                    className="h-4 w-4 accent-accent"
                  />
                  This bill going forward (updates Monthly Bills too)
                </label>
              </div>
            </>
          )}
          <div>
            <label className="mb-1 block text-xs text-muted">Type</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm outline-none"
            >
              <option value="expense">{isCard ? "Purchase" : "Expense"}</option>
              <option value="income">{isCard ? "Payment" : "Income"}</option>
              {isNew && !isCard && paymentTargetAccountId && (
                <option value="card_payment">Credit card payment</option>
              )}
              {isNew && <option value="balance">Today&rsquo;s balance</option>}
            </select>
          </div>
          {isNew && isCard && kind === "income" && (
            <div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={paidFromBills && !!paymentSourceAccountId}
                  disabled={!paymentSourceAccountId}
                  onChange={(e) => setPaidFromBills(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                Paid from Bills account
              </label>
              <p className="mt-1 text-xs text-muted">
                {paymentSourceAccountId
                  ? "Shows on both forecasts, so the two stay linked."
                  : "No account with “bills” in its name was found."}
              </p>
            </div>
          )}
          {linkedToCard && (
            <p className="-mt-1 text-xs text-muted">
              Comes out of this account and shows on CC Forecast as a payment.
            </p>
          )}
          {isBalance ? (
            <div>
              <label className="mb-1 block text-xs text-muted">
                {isCard ? "Current balance (€, negative = owed)" : "Current balance (€)"}
              </label>
              <input
                name="balance_amount"
                type="number"
                step="0.01"
                defaultValue={currentBalance}
                required
                autoFocus
                className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm outline-none"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs text-muted">Date</label>
                <input
                  name="date"
                  type="date"
                  defaultValue={tx?.date ?? todayISO()}
                  required
                  className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm outline-none"
                />
              </div>
              {isNew && (
                <div>
                  <label className="mb-1 block text-xs text-muted">Repeats</label>
                  <select
                    name="repeat"
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value as typeof repeat)}
                    className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm outline-none"
                  >
                    <option value="none">Doesn&rsquo;t repeat</option>
                    {FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {FREQUENCY_LABELS[f]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs text-muted">Description</label>
                <input
                  name="description"
                  defaultValue={tx?.merchant ?? ""}
                  required
                  className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Amount (€)</label>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  defaultValue={tx ? Math.abs(tx.amount) : undefined}
                  required
                  className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm outline-none"
                />
              </div>
              {!repeating && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="on_hold"
                  defaultChecked={tx?.status === "on_hold"}
                  className="h-4 w-4 accent-accent"
                />
                Put this aside for now (won&rsquo;t count toward the forecast)
              </label>
              )}
            </>
          )}
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
              {pending ? "Saving…" : isBalance ? "Next" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
