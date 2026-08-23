"use client";

import {
  type ReactNode,
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  createBill,
  deleteBill,
  setBillActive,
  updateBill,
  type BillFormState,
  type SavedBill,
} from "./actions";
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  nextOccurrenceOnOrAfter,
  occurrencesInMonth,
} from "@/lib/recurrence";

type Bill = SavedBill;

type Account = { id: string; name: string };

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

function signedAmount(bill: Bill) {
  return bill.kind === "income" ? bill.amount : -bill.amount;
}

function formatSigned(bill: Bill) {
  const amount = signedAmount(bill);
  const formatted = currency.format(Math.abs(amount));
  return amount >= 0 ? `+${formatted}` : `-${formatted}`;
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

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type SortKey = "next_due_date" | "description" | "amount" | "frequency";

export function BillsClient({
  initialBills,
  accounts,
}: {
  initialBills: Bill[];
  accounts: Account[];
}) {
  const [bills, setBills] = useState(initialBills);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [sortKey, setSortKey] = useState<SortKey>("next_due_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [editingBill, setEditingBill] = useState<Bill | "new" | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth() + 1);
  const [isPending, startTransition] = useTransition();

  const accountName = (id: string) =>
    accounts.find((a) => a.id === id)?.name ?? "—";

  // The rule's next_due_date is a fixed anchor from whenever it was set —
  // it drifts into the past as months go by. This is the real upcoming
  // occurrence relative to today, recomputed on every render.
  const nextOccurrence = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const bill of bills) {
      map.set(bill.id, nextOccurrenceOnOrAfter(bill, todayISO));
    }
    return map;
  }, [bills, todayISO]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedBills = useMemo(() => {
    const copy = [...bills];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "amount") cmp = a.amount - b.amount;
      else if (sortKey === "next_due_date") {
        cmp = (nextOccurrence.get(a.id) ?? "").localeCompare(
          nextOccurrence.get(b.id) ?? "",
        );
      } else cmp = String(a[sortKey]).localeCompare(String(b[sortKey]));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [bills, sortKey, sortDir, nextOccurrence]);

  function handleDelete(id: string) {
    if (!confirm("Delete this bill? This can't be undone.")) return;
    setBills((prev) => prev.filter((b) => b.id !== id));
    startTransition(() => {
      deleteBill(id);
    });
  }

  function handleToggleActive(bill: Bill) {
    setBills((prev) =>
      prev.map((b) => (b.id === bill.id ? { ...b, active: !b.active } : b)),
    );
    startTransition(() => {
      setBillActive(bill.id, !bill.active);
    });
  }

  function upsertLocal(bill: Bill) {
    setBills((prev) => {
      const exists = prev.some((b) => b.id === bill.id);
      return exists
        ? prev.map((b) => (b.id === bill.id ? bill : b))
        : [...prev, bill];
    });
  }

  const monthOccurrences = useMemo(() => {
    const map = new Map<string, Bill[]>();
    for (const bill of bills) {
      if (!bill.active) continue;
      const dates = occurrencesInMonth(bill, calendarYear, calendarMonth);
      for (const date of dates) {
        const list = map.get(date) ?? [];
        list.push(bill);
        map.set(date, list);
      }
    }
    return map;
  }, [bills, calendarYear, calendarMonth]);

  const monthNet = useMemo(() => {
    let total = 0;
    for (const list of monthOccurrences.values()) {
      for (const b of list) total += signedAmount(b);
    }
    return total;
  }, [monthOccurrences]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Bills</h1>
          <p className="text-sm text-foreground/60">
            {bills.filter((b) => b.active).length} active recurring bills
          </p>
        </div>
        <button
          onClick={() => setEditingBill("new")}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          Add bill
        </button>
      </div>

      <div className="flex items-center gap-1 rounded-md border border-foreground/15 p-1 w-fit">
        <button
          onClick={() => setView("list")}
          className={`rounded px-3 py-1 text-sm transition-colors ${view === "list" ? "bg-accent text-white" : "text-foreground/60 hover:text-accent"}`}
        >
          List
        </button>
        <button
          onClick={() => setView("calendar")}
          className={`rounded px-3 py-1 text-sm transition-colors ${view === "calendar" ? "bg-accent text-white" : "text-foreground/60 hover:text-accent"}`}
        >
          Calendar
        </button>
      </div>

      {view === "list" ? (
        <div className="overflow-x-auto rounded-md border border-foreground/15">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/15 text-left text-foreground/60">
                <Th label="Description" onClick={() => toggleSort("description")} active={sortKey === "description"} dir={sortDir} />
                <th className="px-3 py-2 font-normal">Account</th>
                <Th label="Frequency" onClick={() => toggleSort("frequency")} active={sortKey === "frequency"} dir={sortDir} />
                <Th label="Amount" onClick={() => toggleSort("amount")} active={sortKey === "amount"} dir={sortDir} align="right" />
                <Th label="Next due" onClick={() => toggleSort("next_due_date")} active={sortKey === "next_due_date"} dir={sortDir} />
                <th className="px-3 py-2 font-normal">Active</th>
                <th className="px-3 py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {sortedBills.map((bill) => (
                <tr
                  key={bill.id}
                  className={`border-b border-foreground/10 last:border-0 ${!bill.active ? "opacity-40" : ""}`}
                >
                  <td className="px-3 py-2">{bill.description}</td>
                  <td className="px-3 py-2 text-foreground/60">{accountName(bill.account_id)}</td>
                  <td className="px-3 py-2 text-foreground/60">{FREQUENCY_LABELS[bill.frequency]}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${bill.kind === "income" ? "text-emerald-600 dark:text-emerald-400" : ""}`}
                  >
                    {formatSigned(bill)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {(() => {
                      const next = nextOccurrence.get(bill.id);
                      return next ? formatDate(next) : "—";
                    })()}
                  </td>
                  <td className="px-3 py-2 text-foreground/60">
                    {bill.active ? "active" : "paused"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <RowMenu
                      open={openMenuId === bill.id}
                      onToggle={() =>
                        setOpenMenuId((id) => (id === bill.id ? null : bill.id))
                      }
                      onClose={() => setOpenMenuId(null)}
                    >
                      <button
                        onClick={() => {
                          handleToggleActive(bill);
                          setOpenMenuId(null);
                        }}
                        disabled={isPending}
                        className="block w-full px-3 py-2 text-left text-sm text-foreground/80 transition-colors hover:bg-foreground/5"
                      >
                        {bill.active ? "Pause" : "Resume"}
                      </button>
                      <button
                        onClick={() => {
                          setEditingBill(bill);
                          setOpenMenuId(null);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-foreground/80 transition-colors hover:bg-foreground/5"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          handleDelete(bill.id);
                          setOpenMenuId(null);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-red-500 transition-colors hover:bg-red-500/5"
                      >
                        Delete
                      </button>
                    </RowMenu>
                  </td>
                </tr>
              ))}
              {sortedBills.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-foreground/40">
                    No bills yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
                className={`text-xs ${monthNet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground/60"}`}
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
            occurrences={monthOccurrences}
            onSelectBill={(bill) => setEditingBill(bill)}
          />
        </div>
      )}

      {editingBill && (
        <BillFormModal
          bill={editingBill === "new" ? null : editingBill}
          accounts={accounts}
          onClose={() => setEditingBill(null)}
          onSaved={(bill) => {
            upsertLocal(bill);
            setEditingBill(null);
          }}
        />
      )}
    </div>
  );
}

function RowMenu({
  open,
  onToggle,
  onClose,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <span className="relative inline-block">
      <button
        onClick={onToggle}
        aria-label="Actions"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-accent"
      >
        ⋮
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <div className="absolute right-0 z-50 mt-1 w-36 overflow-hidden rounded-md border border-foreground/15 bg-background shadow-lg">
            {children}
          </div>
        </>
      )}
    </span>
  );
}

function Th({
  label,
  onClick,
  active,
  dir,
  align,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
  align?: "right";
}) {
  return (
    <th className={`px-3 py-2 font-normal ${align === "right" ? "text-right" : ""}`}>
      <button onClick={onClick} className="transition-colors hover:text-accent">
        {label}
        {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}

function CalendarGrid({
  year,
  month,
  occurrences,
  onSelectBill,
}: {
  year: number;
  month: number;
  occurrences: Map<string, Bill[]>;
  onSelectBill: (bill: Bill) => void;
}) {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="overflow-x-auto rounded-md border border-foreground/15">
      <div className="grid min-w-[640px] grid-cols-7 border-b border-foreground/15 text-xs text-foreground/60">
        {WEEKDAY_NAMES.map((d) => (
          <div key={d} className="px-2 py-2 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid min-w-[640px] grid-cols-7">
        {cells.map((day, i) => {
          const iso = day
            ? `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`
            : null;
          const dayBills = iso ? occurrences.get(iso) ?? [] : [];
          return (
            <div
              key={i}
              className="min-h-24 border-b border-r border-foreground/10 p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0"
            >
              {day && (
                <>
                  <div className="text-xs text-foreground/40">{day}</div>
                  <div className="mt-1 space-y-1">
                    {dayBills.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => onSelectBill(b)}
                        className={`block w-full truncate rounded px-1 py-0.5 text-left text-[11px] leading-tight hover:bg-foreground/20 ${
                          b.kind === "income"
                            ? "bg-emerald-600/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-foreground/10"
                        }`}
                        title={`${b.description} — ${formatSigned(b)}`}
                      >
                        {b.description} · {formatSigned(b)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BillFormModal({
  bill,
  accounts,
  onClose,
  onSaved,
}: {
  bill: Bill | null;
  accounts: Account[];
  onClose: () => void;
  onSaved: (bill: Bill) => void;
}) {
  const isNew = !bill;
  const action = isNew ? createBill : updateBill.bind(null, bill!.id);
  const [state, formAction, pending] = useActionState<BillFormState, FormData>(
    action,
    undefined,
  );

  useEffect(() => {
    if (state?.bill) onSaved(state.bill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-lg border border-foreground/15 bg-background p-5 shadow-xl">
        <h2 className="mb-4 font-medium">{isNew ? "Add bill" : "Edit bill"}</h2>
        <form action={formAction} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-foreground/60">Description</label>
            <input
              name="description"
              defaultValue={bill?.description}
              required
              className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-foreground/60">Account</label>
            <select
              name="account_id"
              defaultValue={bill?.account_id ?? accounts[0]?.id}
              required
              className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/40"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-foreground/60">Type</label>
              <select
                name="kind"
                defaultValue={bill?.kind ?? "expense"}
                className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/40"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-foreground/60">Amount (€)</label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={bill?.amount}
                required
                className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/40"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-foreground/60">Frequency</label>
            <select
              name="frequency"
              defaultValue={bill?.frequency ?? "monthly"}
              className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/40"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-foreground/60">Next due date</label>
            <input
              name="next_due_date"
              type="date"
              defaultValue={bill?.next_due_date}
              required
              className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/40"
            />
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
