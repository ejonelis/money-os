import { createClient } from "@/lib/supabase/server";
import { requireHouseholdId } from "@/lib/household";
import { NetWorthClient } from "./NetWorthClient";

export default async function NetWorthPage() {
  const householdId = await requireHouseholdId();
  const supabase = await createClient();

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name, group_label, is_liability, archived")
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

  return (
    <NetWorthClient
      initialAccounts={accounts ?? []}
      initialSnapshots={snapshots ?? []}
    />
  );
}
