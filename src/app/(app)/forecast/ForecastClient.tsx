"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import {
  addTransaction,
  deleteTransaction,
  setTransactionStatus,
  updateTransaction,
  type SavedTransaction,
  type TxFormState,
} from "./actions";

type Account = { id: string; name: string };

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
  accounts,
  selectedAccountId,
  startingBalance,
  startingBalanceDate,
  initialTransactions,
}: {
  accounts: Account[];
  selectedAccountId: string;
  startingBalance: number;
  startingBalanceDate: string | null;
  initialTransactions: SavedTransaction[];
}) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [editingTx, setEditingTx] = useState<SavedTransaction | "new" | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const today = todayISO();

  const rows = useMemo(() => {
    const sorted = [...transactions].sort((a, b) =>
      a.date === b.date ? 0 : a.date < b.date ? -1 : 1,
    );
    return sorted.reduce<Array<SavedTransaction & { balance: number }>>(
      (acc, tx) => {
        const prevBalance =
          acc.length > 0 ? acc[acc.length - 1].balance : startingBalance;
        return [...acc, { ...tx, balance: prevBalance + tx.amount }];
      },
      [],
    );
  }, [transactions, startingBalance]);

  const endingBalance = rows.length > 0 ? rows[rows.length - 1].balance : startingBalance;

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

  function handleToggleStatus(tx: SavedTransaction) {
    const next = tx.status === "planned" ? "actual" : "planned";
    setTransactions((prev) =>
      prev.map((t) => (t.id === tx.id ? { ...t, status: next } : t)),
    );
    startTransition(() => {
      setTransactionStatus(tx.id, next);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Forecast</h1>
          <p className="text-sm text-foreground/60">
            {startingBalanceDate
              ? `Starting from ${currency.format(startingBalance)} on ${formatDate(startingBalanceDate)}`
              : "No starting balance set yet — starting from €0.00"}
          </p>
        </div>
        <button
          onClick={() => setEditingTx("new")}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
        >
          Add entry
        </button>
      </div>

      <div className="flex items-center gap-1 rounded-md border border-foreground/15 p-1 w-fit">
        {accounts.map((a) => (
          <Link
            key={a.id}
            href={`/forecast?account=${a.id}`}
            className={`rounded px-3 py-1 text-sm ${
              a.id === selectedAccountId
                ? "bg-foreground text-background"
                : "text-foreground/60"
            }`}
          >
            {a.name}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border border-foreground/15">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-foreground/15 text-left text-foreground/60">
              <th className="px-3 py-2 font-normal">Date</th>
              <th className="px-3 py-2 font-normal">Description</th>
              <th className="px-3 py-2 text-right font-normal">Amount</th>
              <th className="px-3 py-2 text-right font-normal">Balance</th>
              <th className="px-3 py-2 font-normal">Status</th>
              <th className="px-3 py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-foreground/10 text-foreground/40">
              <td className="px-3 py-2" colSpan={3}>
                {startingBalanceDate
                  ? `Balance as of ${formatDate(startingBalanceDate)}`
                  : "Starting balance"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {currency.format(startingBalance)}
              </td>
              <td colSpan={2} />
            </tr>
            {rows.map((tx) => {
              const overdue = tx.status === "planned" && tx.date < today;
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
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleToggleStatus(tx)}
                      disabled={isPending}
                      className={`text-xs underline decoration-dotted ${
                        overdue
                          ? "text-amber-600 dark:text-amber-400"
                          : tx.status === "actual"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-foreground/60"
                      }`}
                    >
                      {tx.status === "actual" ? "cleared" : "planned"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditingTx(tx)}
                      className="mr-3 text-xs text-foreground/60 hover:text-foreground"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(tx.id)}
                      className="text-xs text-red-500 hover:text-red-400"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-foreground/40">
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
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

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
          {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-foreground/15 px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
