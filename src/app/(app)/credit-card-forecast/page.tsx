import { createClient } from "@/lib/supabase/server";
import { requireHouseholdId } from "@/lib/household";
import { materializePlannedTransactions } from "../bills-forecast/materialize";
import { ForecastClient } from "../bills-forecast/ForecastClient";
import { findBillsAccount, findCardAccount } from "@/lib/accounts";
import type { SavedTransaction } from "../bills-forecast/actions";

export default async function CreditCardForecastPage() {
  const householdId = await requireHouseholdId();
  const supabase = await createClient();

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name, type, credit_limit")
    .eq("household_id", householdId)
    .eq("archived", false)
    .order("name", { ascending: true });

  if (accountsError) throw new Error(accountsError.message);

  const card = findCardAccount(accounts);

  if (!card) {
    return (
      <p className="text-sm text-muted">
        No credit card account yet — add one from the Net Worth page.
      </p>
    );
  }

  // Bills assigned to the card generate their own planned purchases here.
  await materializePlannedTransactions(supabase, card.id);

  // Payments into the card: bills (e.g. a weekly card payment on the Bills
  // account) that point at this card. They're read straight from the source
  // account's planned entries, so editing or clearing them over there is
  // always reflected here — nothing is stored twice.
  const { data: paymentRules } = await supabase
    .from("recurring_rules")
    .select("id")
    .eq("transfer_to_account_id", card.id)
    .eq("active", true);
  const paymentRuleIds = (paymentRules ?? []).map((r) => r.id);

  const [
    { data: ownTransactions, error: txError },
    { data: paymentTransactions },
    { data: linkedOneOffs },
    { data: snapshot },
    { data: categories },
    { data: history },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, account_id, date, amount, status, merchant, recurring_rule_id")
      .eq("account_id", card.id)
      .in("status", ["planned", "on_hold"])
      .order("date", { ascending: true }),
    paymentRuleIds.length > 0
      ? supabase
          .from("transactions")
          .select("id, account_id, date, amount, status, merchant, recurring_rule_id")
          .in("recurring_rule_id", paymentRuleIds)
          .eq("status", "planned")
          .order("date", { ascending: true })
      : Promise.resolve({ data: [] as SavedTransaction[] }),
    // One-off payments entered on another account (e.g. Bills) that point
    // at the card.
    supabase
      .from("transactions")
      .select("id, account_id, date, amount, status, merchant, recurring_rule_id")
      .eq("transfer_to_account_id", card.id)
      .eq("status", "planned")
      .order("date", { ascending: true }),
    supabase
      .from("balance_snapshots")
      .select("balance, as_of_date")
      .eq("account_id", card.id)
      .order("as_of_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("categories")
      .select("name")
      .eq("household_id", householdId)
      .order("name", { ascending: true }),

    supabase
      .from("balance_snapshots")
      .select("balance, as_of_date")
      .eq("account_id", card.id)
      .order("as_of_date", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (txError) throw new Error(txError.message);

  const payments: SavedTransaction[] = [
    ...(paymentTransactions ?? []),
    ...(linkedOneOffs ?? []),
  ].map((t) => ({
    ...t,
    id: `payment-${t.id}`,
    account_id: card.id,
    // Money leaving the paying account lands on the card as a credit.
    amount: Math.abs(t.amount),
    merchant: t.merchant ?? "Card payment",
    recurring_rule_id: null,
    readOnly: true,
  }));

  return (
    <ForecastClient
      variant="card"
      title="CC Forecast"
      creditLimit={card.credit_limit}
      paymentSourceAccountId={findBillsAccount(accounts, card.id)?.id ?? null}
      selectedAccountId={card.id}
      startingBalance={snapshot?.balance ?? 0}
      startingBalanceDate={snapshot?.as_of_date ?? null}
      initialTransactions={[...(ownTransactions ?? []), ...payments]}
      balanceHistory={history ?? []}
      existingCategories={Array.from(new Set((categories ?? []).map((c) => c.name)))}
    />
  );
}
