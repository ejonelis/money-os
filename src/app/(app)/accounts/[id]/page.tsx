import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireHouseholdId } from "@/lib/household";
import { AccountLedgerClient } from "./AccountLedgerClient";

export default async function AccountLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const householdId = await requireHouseholdId();
  const supabase = await createClient();
  const { id } = await params;

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, name, is_liability")
    .eq("household_id", householdId)
    .eq("id", id)
    .maybeSingle();

  if (accountError) throw new Error(accountError.message);
  if (!account) notFound();

  const [{ data: transactions, error: txError }, { data: snapshot }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("id, account_id, date, amount, merchant")
        .eq("account_id", account.id)
        .order("date", { ascending: true }),
      supabase
        .from("balance_snapshots")
        .select("balance, as_of_date")
        .eq("account_id", account.id)
        .order("as_of_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (txError) throw new Error(txError.message);

  return (
    <AccountLedgerClient
      account={account}
      startingBalance={snapshot?.balance ?? 0}
      startingBalanceDate={snapshot?.as_of_date ?? null}
      initialTransactions={transactions ?? []}
    />
  );
}
