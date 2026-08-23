import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireHouseholdId } from "@/lib/household";

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

export default async function DebtsPage() {
  const householdId = await requireHouseholdId();
  const supabase = await createClient();

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name, group_label, original_amount")
    .eq("household_id", householdId)
    .eq("archived", false)
    .eq("is_liability", true)
    .order("name", { ascending: true });

  if (accountsError) throw new Error(accountsError.message);

  const accountIds = (accounts ?? []).map((a) => a.id);
  const { data: snapshots, error: snapshotsError } =
    accountIds.length > 0
      ? await supabase
          .from("balance_snapshots")
          .select("account_id, as_of_date, balance, created_at")
          .in("account_id", accountIds)
          .order("as_of_date", { ascending: true })
          .order("created_at", { ascending: true })
      : { data: [], error: null };

  if (snapshotsError) throw new Error(snapshotsError.message);

  const latest = new Map<string, number>();
  for (const s of snapshots ?? []) {
    latest.set(s.account_id, s.balance);
  }

  const debts = (accounts ?? []).map((a) => {
    const balance = latest.get(a.id) ?? 0;
    const remaining = Math.abs(balance);
    const original = a.original_amount ?? remaining;
    const paidOff = remaining <= 0;
    const percentPaid =
      original > 0 ? Math.min(100, Math.round(((original - remaining) / original) * 100)) : 0;
    return { ...a, remaining, original, paidOff, percentPaid };
  });

  const active = debts
    .filter((d) => !d.paidOff)
    .sort((a, b) => a.remaining - b.remaining);
  const paidOff = debts.filter((d) => d.paidOff);

  const total = active.reduce((sum, d) => sum + d.remaining, 0);
  const totalPaidOff = paidOff.reduce((sum, d) => sum + d.original, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Debts</h1>
        <p className="text-lg font-medium tabular-nums text-red-500">
          {currency.format(total)} remaining
        </p>
      </div>

      {debts.length === 0 && (
        <p className="text-sm text-foreground/60">
          No debts tracked yet — add one from the Net Worth page.
        </p>
      )}

      {active.length > 0 && (
        <div className="overflow-hidden rounded-md border border-foreground/15">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/15 bg-foreground/5 text-left text-foreground/60">
                <th className="px-4 py-2 font-normal">Debt</th>
                <th className="px-4 py-2 font-normal">Category</th>
                <th className="px-4 py-2 font-normal">Progress</th>
                <th className="px-4 py-2 text-right font-normal">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {active.map((d) => (
                <tr key={d.id} className="border-b border-foreground/10 last:border-0">
                  <td className="px-4 py-2">
                    <Link
                      href={`/accounts/${d.id}`}
                      className="transition-colors hover:text-accent"
                    >
                      {d.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs text-foreground/40">
                    {d.group_label ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-foreground/10">
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${d.percentPaid}%` }}
                        />
                      </div>
                      <span className="text-xs text-foreground/40">
                        {d.percentPaid}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-red-500">
                    {currency.format(d.remaining)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-foreground/15 font-medium">
                <td className="px-4 py-2" colSpan={3}>
                  Total owed
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-red-500">
                  {currency.format(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {paidOff.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-foreground/60">
            Paid off 🎉 ({currency.format(totalPaidOff)})
          </h2>
          <div className="overflow-hidden rounded-md border border-foreground/15">
            <table className="w-full text-sm">
              <tbody>
                {paidOff.map((d) => (
                  <tr key={d.id} className="border-b border-foreground/10 last:border-0">
                    <td className="px-4 py-2 text-foreground/40 line-through">
                      {d.name}
                    </td>
                    <td className="px-4 py-2 text-xs text-foreground/30">
                      {d.group_label ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-foreground/30 line-through">
                      {currency.format(d.original)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
