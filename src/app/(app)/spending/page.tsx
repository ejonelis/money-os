import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireHouseholdId } from "@/lib/household";

const currency = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${next.y}-${pad(next.m)}-01`, // exclusive
    prev: `${prev.y}-${pad(prev.m)}`,
    next: `${next.y}-${pad(next.m)}`,
    label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IE", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}

function formatDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : thisMonth;
  const b = monthBounds(month);

  const householdId = await requireHouseholdId();
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("household_id", householdId);
  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]));
  const accountIds = (accounts ?? []).map((a) => a.id);

  const { data: rows, error } =
    accountIds.length > 0
      ? await supabase
          .from("transactions")
          .select("id, account_id, date, amount, merchant, is_transfer, transfer_to_account_id, categories(name)")
          .in("account_id", accountIds)
          .eq("status", "actual")
          .gte("date", b.from)
          .lt("date", b.to)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false })
      : { data: [], error: null };
  if (error) throw new Error(error.message);

  // Money moving between our own accounts (e.g. a card payment) is a
  // transfer, not spending or income.
  const entries = (rows ?? [])
    .filter((t) => !t.is_transfer && !t.transfer_to_account_id)
    .map((t) => {
      const cat = t.categories as unknown as { name: string } | { name: string }[] | null;
      const category = (Array.isArray(cat) ? cat[0]?.name : cat?.name) ?? "Uncategorized";
      return { ...t, category };
    });

  const income = entries.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = entries.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const balance = income - expense;
  const total = income + expense;

  const byCategory = new Map<string, number>();
  for (const t of entries) {
    if (t.amount < 0) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) - t.amount);
  }
  const categories = [...byCategory.entries()].sort((a, c) => c[1] - a[1]);

  const days = new Map<string, typeof entries>();
  for (const t of entries) days.set(t.date, [...(days.get(t.date) ?? []), t]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Spending</h1>

      <div className="flex items-center justify-center gap-4">
        <Link href={`/spending?month=${b.prev}`} className="px-2 text-xl text-muted hover:text-accent" aria-label="Previous month">
          ‹
        </Link>
        <form className="flex items-center gap-2">
          <input
            type="month"
            name="month"
            defaultValue={month}
            className="rounded-md border border-hairline bg-surface px-2 py-1 text-sm"
          />
          <button type="submit" className="text-xs text-muted hover:text-accent">
            Go
          </button>
        </form>
        <Link href={`/spending?month=${b.next}`} className="px-2 text-xl text-muted hover:text-accent" aria-label="Next month">
          ›
        </Link>
      </div>

      <div className="space-y-3 rounded-lg border border-hairline p-4 shadow-card">
        <div className="flex h-2 overflow-hidden rounded-full bg-red-500/30">
          <div className="bg-emerald-500" style={{ width: total > 0 ? `${(income / total) * 100}%` : "0%" }} />
          <div className="bg-red-500" style={{ width: total > 0 ? `${(expense / total) * 100}%` : "0%" }} />
        </div>
        <p className="flex justify-between text-lg">
          <span>Income</span>
          <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{currency.format(income)}</span>
        </p>
        <p className="flex justify-between text-lg">
          <span>Expense</span>
          <span className="tabular-nums text-red-500">{currency.format(expense)}</span>
        </p>
        {categories.length > 0 && (
          <div className="space-y-1 pl-4 text-sm text-muted">
            {categories.map(([name, amount]) => (
              <p key={name} className="flex justify-between">
                <span>{name}</span>
                <span className="tabular-nums">{currency.format(amount)}</span>
              </p>
            ))}
          </div>
        )}
        <p className="flex justify-between border-t border-hairline pt-3 text-lg font-medium">
          <span>Balance</span>
          <span className={`tabular-nums ${balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
            {balance >= 0 ? "+" : "-"}
            {currency.format(Math.abs(balance))}
          </span>
        </p>
      </div>

      {days.size === 0 ? (
        <p className="py-6 text-center text-sm text-foreground/40">Nothing logged for {b.label}.</p>
      ) : (
        [...days.entries()].map(([date, list]) => (
          <div key={date}>
            <div className="mb-1 px-1 text-xs font-medium text-foreground/50">{formatDay(date)}</div>
            <div className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline shadow-card">
              {list.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{t.merchant ?? "—"}</span>
                    <span className="block truncate text-xs text-muted">
                      {t.category} · {accountName.get(t.account_id)}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-sm tabular-nums ${t.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}
                  >
                    {t.amount >= 0 ? "+" : "-"}
                    {currency.format(Math.abs(t.amount))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
