import { createClient } from "@/lib/supabase/server";
import { requireHouseholdId } from "@/lib/household";
import { materializePlannedTransactions } from "./materialize";
import { ForecastClient } from "./ForecastClient";

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const householdId = await requireHouseholdId();
  const supabase = await createClient();
  const { account: requestedAccountId } = await searchParams;

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("household_id", householdId)
    .eq("archived", false)
    .order("name", { ascending: true });

  if (accountsError) throw new Error(accountsError.message);
  if (!accounts || accounts.length === 0) {
    return (
      <p className="text-sm text-foreground/60">
        No accounts yet — nothing to forecast.
      </p>
    );
  }

  const selectedAccount =
    accounts.find((a) => a.id === requestedAccountId) ??
    accounts.find((a) => a.name.toLowerCase().includes("bills")) ??
    accounts[0];

  await materializePlannedTransactions(supabase, selectedAccount.id);

  const [{ data: transactions, error: txError }, { data: snapshot }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("id, account_id, date, amount, status, merchant, recurring_rule_id")
        .eq("account_id", selectedAccount.id)
        .order("date", { ascending: true }),
      supabase
        .from("balance_snapshots")
        .select("balance, as_of_date")
        .eq("account_id", selectedAccount.id)
        .order("as_of_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (txError) throw new Error(txError.message);

  return (
    <ForecastClient
      accounts={accounts}
      selectedAccountId={selectedAccount.id}
      startingBalance={snapshot?.balance ?? 0}
      startingBalanceDate={snapshot?.as_of_date ?? null}
      initialTransactions={transactions ?? []}
    />
  );
}
