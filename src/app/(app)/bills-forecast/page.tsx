import { createClient } from "@/lib/supabase/server";
import { requireHouseholdId } from "@/lib/household";
import { materializePlannedTransactions } from "./materialize";
import { ForecastClient } from "./ForecastClient";

export default async function ForecastPage() {
  const householdId = await requireHouseholdId();
  const supabase = await createClient();

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
    accounts.find((a) => a.name.toLowerCase().includes("bills")) ??
    accounts[0];

  await materializePlannedTransactions(supabase, selectedAccount.id);

  const [{ data: transactions, error: txError }, { data: snapshot }, { data: categories }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("id, account_id, date, amount, status, merchant, recurring_rule_id")
        // Forecast only shows what's still upcoming — cleared/actual
        // entries move to the account's own ledger (see /accounts).
        .eq("account_id", selectedAccount.id)
        .in("status", ["planned", "on_hold"])
        .order("date", { ascending: true }),
      supabase
        .from("balance_snapshots")
        .select("balance, as_of_date")
        .eq("account_id", selectedAccount.id)
        .order("as_of_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("categories")
        .select("name")
        .eq("household_id", householdId)
        .order("name", { ascending: true }),
    ]);

  if (txError) throw new Error(txError.message);

  return (
    <ForecastClient
      selectedAccountId={selectedAccount.id}
      startingBalance={snapshot?.balance ?? 0}
      startingBalanceDate={snapshot?.as_of_date ?? null}
      initialTransactions={transactions ?? []}
      existingCategories={Array.from(new Set((categories ?? []).map((c) => c.name)))}
    />
  );
}
