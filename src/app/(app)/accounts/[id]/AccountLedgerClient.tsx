"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import {
  addLedgerEntry,
  deleteLedgerEntry,
  updateLedgerEntry,
  type SavedTransaction,
  type TxFormState,
} from "./actions";

type Account = { id: string; name: string; is_liability: boolean };

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

export function AccountLedgerClient({
  account,
  startingBalance,
  startingBalanceDate,
  initialTransactions,
}: {
  account: Account;
  startingBalance: number;
  startingBalanceDate: string | null;
  initialTransactions: SavedTransaction[];
}) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [editingTx, setEditingTx] = useState<SavedTransaction | "new" | null>(
    null,
  );
  const [, startTransition] = useTransition();

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

  const currentBalance =
    rows.length > 0 ? rows[rows.length - 1].balance : startingBalance;

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
      deleteLedgerEntry(id);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/accounts"
          className="text-sm text-foreground/60 transition-colors hover:text-accent"
        >
          ← Accounts
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{account.name}</h1>
          <p
            className={`text-lg font-medium tabular-nums ${
              currentBalance < 0 ? "text-red-500" : ""
            }`}
          >
            {currency.format(currentBalance)}
            {account.is_liability ? " owed" : ""}
          </p>
        </div>
        <button
          onClick={() => setEditingTx("new")}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          Log payment
        </button>
      </div>

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
                {startingBalanceDate
                  ? `Starting balance as of ${formatDate(startingBalanceDate)}`
                  : "Starting balance"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {currency.format(startingBalance)}
              </td>
              <td />
            </tr>
            {rows.map((tx) => (
              <tr key={tx.id} className="border-b border-foreground/10 last:border-0">
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-foreground/40">
                  Nothing logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingTx && (
        <EntryFormModal
          tx={editingTx === "new" ? null : editingTx}
          account={account}
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

function EntryFormModal({
  tx,
  account,
  onClose,
  onSaved,
}: {
  tx: SavedTransaction | null;
  account: Account;
  onClose: () => void;
  onSaved: (tx: SavedTransaction) => void;
}) {
  const isNew = !tx;
  const action = isNew ? addLedgerEntry : updateLedgerEntry.bind(null, tx!.id);
  const [state, formAction, pending] = useActionState<TxFormState, FormData>(
    action,
    undefined,
  );
  const [kind, setKind] = useState<"income" | "expense">(
    tx && tx.amount < 0 ? "expense" : "income",
  );

  useEffect(() => {
    if (state?.transaction) onSaved(state.transaction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-lg border border-foreground/15 bg-background p-5 shadow-xl">
        <h2 className="mb-4 font-medium">
          {isNew ? "Log payment" : "Edit entry"}
        </h2>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="account_id" value={account.id} />
          <div>
            <label className="mb-1 block text-xs text-foreground/60">Description</label>
            <input
              name="description"
              defaultValue={tx?.merchant ?? ""}
              placeholder={account.is_liability ? "e.g. Paid to Danske Bank" : ""}
              required
              className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/40"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {!account.is_liability && (
              <div>
                <label className="mb-1 block text-xs text-foreground/60">Type</label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as "income" | "expense")}
                  className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/40"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
            )}
            <div className={account.is_liability ? "col-span-2" : ""}>
              <label className="mb-1 block text-xs text-foreground/60">
                {account.is_liability ? "Amount paid (€)" : "Amount (€)"}
              </label>
              <AmountField
                account={account}
                kind={kind}
                defaultValue={tx ? Math.abs(tx.amount) : undefined}
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

function AmountField({
  account,
  kind,
  defaultValue,
}: {
  account: Account;
  kind: "income" | "expense";
  defaultValue: number | undefined;
}) {
  const [magnitude, setMagnitude] = useState(defaultValue?.toString() ?? "");
  const sign = account.is_liability ? 1 : kind === "income" ? 1 : -1;
  const signedAmount =
    magnitude === "" ? "" : (sign * Math.abs(Number(magnitude) || 0)).toString();

  return (
    <>
      <input
        type="number"
        step="0.01"
        min="0.01"
        value={magnitude}
        onChange={(e) => setMagnitude(e.target.value)}
        required
        className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/40"
      />
      <input type="hidden" name="signed_amount" value={signedAmount} />
    </>
  );
}
