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
        <div key={label} className="overflow-hidden rounded-md border border-foreground/15">
          <div className="border-b border-foreground/15 bg-foreground/5 px-4 py-2 text-sm font-medium">
            {label}
          </div>
          <table className="w-full text-sm">
            <tbody>
              {list!.map((a) => {
                const balance = latest.get(a.id);
                return (
                  <tr
                    key={a.id}
                    className="border-b border-foreground/10 transition-colors last:border-0 hover:bg-foreground/5"
                  >
                    <td className="p-0">
                      <Link href={`/accounts/${a.id}`} className="block px-4 py-3">
                        {a.name}
                      </Link>
                    </td>
                    <td className="p-0 text-right">
                      <Link
                        href={`/accounts/${a.id}`}
                        className={`block px-4 py-3 tabular-nums font-medium ${
                          balance !== undefined && balance < 0 ? "text-red-500" : ""
                        }`}
                      >
                        {balance !== undefined ? currency.format(balance) : "—"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
