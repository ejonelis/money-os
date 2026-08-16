import { createClient } from "@/lib/supabase/server";
import { requireHouseholdId } from "@/lib/household";
import { BalancesClient } from "./BalancesClient";

export default async function BalancesPage() {
  const householdId = await requireHouseholdId();
  const supabase = await createClient();

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name, is_liability")
    .eq("household_id", householdId)
    .eq("archived", false)
    .order("is_liability", { ascending: true })
    .order("name", { ascending: true });

  if (accountsError) throw new Error(accountsError.message);
  if (!accounts || accounts.length === 0) {
    return (
      <p className="text-sm text-foreground/60">
        No accounts yet — nothing to track balances for.
      </p>
    );
  }

  const accountIds = accounts.map((a) => a.id);
  const { data: snapshots, error: snapshotsError } = await supabase
    .from("balance_snapshots")
    .select("account_id, as_of_date, balance")
    .in("account_id", accountIds)
    .order("as_of_date", { ascending: true });

  if (snapshotsError) throw new Error(snapshotsError.message);

  return (
    <BalancesClient accounts={accounts} initialSnapshots={snapshots ?? []} />
  );
}
