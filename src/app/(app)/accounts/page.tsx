import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireHouseholdId } from "@/lib/household";

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

export default async function AccountsPage() {
  const householdId = await requireHouseholdId();
  const supabase = await createClient();

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name, group_label, is_liability")
    .eq("household_id", householdId)
    .eq("archived", false)
    .order("name", { ascending: true });

  if (accountsError) throw new Error(accountsError.message);

  const accountIds = (accounts ?? []).map((a) => a.id);
  const { data: snapshots, error: snapshotsError } =
    accountIds.length > 0
      ? await supabase
          .from("balance_snapshots")
          .select("account_id, as_of_date, balance")
          .in("account_id", accountIds)
          .order("as_of_date", { ascending: true })
      : { data: [], error: null };

  if (snapshotsError) throw new Error(snapshotsError.message);

  const latest = new Map<string, number>();
  for (const s of snapshots ?? []) {
    latest.set(s.account_id, s.balance);
  }

  const groups = new Map<string, typeof accounts>();
  for (const a of accounts ?? []) {
    const label = a.group_label?.trim() || "Accounts";
    const list = groups.get(label) ?? [];
    list.push(a);
    groups.set(label, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Accounts</h1>
        <p className="text-sm text-foreground/60">
          Open an account to see its balance and log payments.
        </p>
      </div>

      {(!accounts || accounts.length === 0) && (
        <p className="text-sm text-foreground/60">
          No accounts yet — add one from the Net Worth page.
        </p>
      )}

      {Array.from(groups.entries()).map(([label, list]) => (
        <div key={label} className="space-y-3">
          <h2 className="text-sm font-medium text-foreground/60">{label}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {list!.map((a) => {
              const balance = latest.get(a.id);
              return (
                <Link
                  key={a.id}
                  href={`/accounts/${a.id}`}
                  className="rounded-md border border-foreground/15 p-4 transition-colors hover:border-accent"
                >
                  <div className="text-sm font-medium">{a.name}</div>
                  <div
                    className={`mt-1 text-lg font-medium tabular-nums ${
                      balance !== undefined && balance < 0 ? "text-red-500" : ""
                    }`}
                  >
                    {balance !== undefined ? currency.format(balance) : "—"}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
