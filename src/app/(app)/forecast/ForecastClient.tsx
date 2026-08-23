"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  addTransaction,
  deleteTransaction,
  setTransactionStatus,
  updateCurrentBalance,
  updateTransaction,
  type BalanceFormState,
  type SavedTransaction,
  type TxFormState,
} from "./actions";

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

function formatSignedAmount(amount: number) {
  const formatted = currency.format(Math.abs(amount));
  return amount >= 0 ? `+${formatted}` : `-${formatted}`;
}

export function ForecastClient({
  selectedAccountId,
  startingBalance,
  startingBalanceDate,
  initialTransactions,
}: {
  selectedAccountId: string;
  startingBalance: number;
  startingBalanceDate: string | null;
  initialTransactions: SavedTransaction[];
}) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [currentBalance, setCurrentBalance] = useState(startingBalance);
  const [currentBalanceDate, setCurrentBalanceDate] = useState(startingBalanceDate);
  const [editingTx, setEditingTx] = useState<SavedTransaction | "new" | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const today = todayISO();

  const planned = useMemo(
    () => transactions.filter((t) => t.status === "planned"),
    [transactions],
  );
  const onHold = useMemo(
    () => transactions.filter((t) => t.status === "on_hold"),
    [transactions],
  );

  const rows = useMemo(() => {
    const sorted = [...planned].sort((a, b) =>
      a.date === b.date ? 0 : a.date < b.date ? -1 : 1,
    );
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
  const firstNegative = rows.find((r) => r.balance < 0);

  function upsertLocal(tx: SavedTransaction) {
    setTransactions((prev) => {
      const exists = prev.some((t) => t.id === tx.id);
      return exists ? prev.map((t) => (t.id === tx.id ? tx : t)) : [...prev, tx];
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this entry? This can't be undone.")) return;
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    startTransition(() => {
      deleteTransaction(id);
    });
  }

  function handleClear(id: string) {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    startTransition(() => {
      setTransactionStatus(id, "actual");
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
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Forecast</h1>
          <p className="text-sm text-foreground/60">
            {currentBalanceDate
              ? `Balance ${currency.format(currentBalance)} as of ${formatDate(currentBalanceDate)}`
              : "No balance set yet — starting from €0.00"}
          </p>
        </div>
        <button
          onClick={() => setEditingTx("new")}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          Add entry
        </button>
      </div>

      {firstNegative ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-4 py-2 text-sm text-red-500">
          ⚠️ Goes into the red on {formatDate(firstNegative.date)}
        </div>
      ) : (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          ✅ Clear for the next 90 days
        </div>
      )}

      <UpdateBalanceForm
        accountId={selectedAccountId}
        currentBalance={currentBalance}
        onSaved={(snapshot) => {
          setCurrentBalance(snapshot.balance);
          setCurrentBalanceDate(snapshot.as_of_date);
        }}
      />

      <div className="overflow-x-auto rounded-md border border-foreground/15">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-foreground/15 text-left text-foreground/60">
              <th className="px-3 py-2 font-normal">Date</th>
              <th className="px-3 py-2 font-normal">Description</th>
              <th className="px-3 py-2 text-right font-normal">Amount</th>
              <th className="px-3 py-2 text-right font-normal">Balance</th>
              <th className="px-3 py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-foreground/10 text-foreground/40">
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
                  className={`border-b border-foreground/10 last:border-0 ${
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
                      tx.balance < 0 ? "text-red-500" : ""
                    }`}
                  >
                    {currency.format(tx.balance)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => handleClear(tx.id)}
                      disabled={isPending}
                      className="mr-3 text-xs text-emerald-600 transition-colors hover:text-accent dark:text-emerald-400"
                    >
                      Mark cleared
                    </button>
                    <button
                      onClick={() => setEditingTx(tx)}
                      className="mr-3 text-xs text-foreground/60 transition-colors hover:text-accent"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(tx.id)}
                      className="text-xs text-red-500 transition-colors hover:text-red-400"
                    >
                      Delete
                    </button>
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
              <tr className="border-t border-foreground/15 font-medium">
                <td className="px-3 py-2" colSpan={3}>
                  Ending balance
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    endingBalance < 0 ? "text-red-500" : ""
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

      {onHold.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-foreground/60">
            Set aside (not counted in the forecast)
          </h2>
          <div className="overflow-hidden rounded-md border border-foreground/15">
            <table className="w-full text-sm">
              <tbody>
                {onHold.map((tx) => (
                  <tr key={tx.id} className="border-b border-foreground/10 last:border-0">
                    <td className="px-3 py-2 tabular-nums text-foreground/60">
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
                        className="mr-3 text-xs text-foreground/60 transition-colors hover:text-accent"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(tx.id)}
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
          onClose={() => setEditingTx(null)}
          onSaved={(tx) => {
            upsertLocal(tx);
            setEditingTx(null);
          }}
        />
      )}
    </div>
  );
}

function UpdateBalanceForm({
  accountId,
  currentBalance,
  onSaved,
}: {
  accountId: string;
  currentBalance: number;
  onSaved: (snapshot: { balance: number; as_of_date: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<BalanceFormState, FormData>(
    updateCurrentBalance,
    undefined,
  );

  useEffect(() => {
    if (state?.snapshot) {
      startTransition(() => {
        onSaved(state.snapshot!);
        setOpen(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-foreground/60 underline decoration-dotted transition-colors hover:text-accent"
      >
        Update today&rsquo;s balance
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-md border border-foreground/15 p-4"
    >
      <input type="hidden" name="account_id" value={accountId} />
      <div>
        <label className="mb-1 block text-xs text-foreground/60">
          Current balance (€)
        </label>
        <input
          name="balance"
          type="number"
          step="0.01"
          defaultValue={currentBalance}
          required
          autoFocus
          className="w-40 rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/40"
        />
      </div>
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-md border border-accent/30 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/10"
      >
        Cancel
      </button>
    </form>
  );
}

function TransactionFormModal({
  tx,
  accountId,
  onClose,
  onSaved,
}: {
  tx: SavedTransaction | null;
  accountId: string;
  onClose: () => void;
  onSaved: (tx: SavedTransaction) => void;
}) {
  const isNew = !tx;
  const action = isNew ? addTransaction : updateTransaction.bind(null, tx!.id);
  const [state, formAction, pending] = useActionState<TxFormState, FormData>(
    action,
    undefined,
  );

  useEffect(() => {
    if (state?.transaction) onSaved(state.transaction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-lg border border-foreground/15 bg-background p-5 shadow-xl">
        <h2 className="mb-4 font-medium">{isNew ? "Add entry" : "Edit entry"}</h2>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="account_id" value={accountId} />
          <div>
            <label className="mb-1 block text-xs text-foreground/60">Description</label>
            <input
              name="description"
              defaultValue={tx?.merchant ?? ""}
              required
              className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/40"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-foreground/60">Type</label>
              <select
                name="kind"
                defaultValue={tx && tx.amount >= 0 ? "income" : "expense"}
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
                defaultValue={tx ? Math.abs(tx.amount) : undefined}
                required
                className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/40"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-foreground/60">Date</label>
            <input
              name="date"
              type="date"
              defaultValue={tx?.date ?? todayISO()}
              required
              className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/40"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="on_hold"
              defaultChecked={tx?.status === "on_hold"}
              className="h-4 w-4 accent-accent"
            />
            Put this aside for now (won&rsquo;t count toward the forecast)
          </label>
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
