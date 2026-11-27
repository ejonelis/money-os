import { createClient } from "@/lib/supabase/server";
import { requireHouseholdId } from "@/lib/household";
import { materializePlannedTransactions } from "../bills-forecast/materialize";
import { ForecastClient } from "../bills-forecast/ForecastClient";
import { findBillsAccount, findCardAccount } from "@/lib/accounts";
import type { SavedTransaction } from "../bills-forecast/actions";
import { occurrencesInRange, type Frequency } from "@/lib/recurrence";

type RuleRow = {
  id: string;
  description: string;
  kind: "expense" | "income";
  frequency: Frequency;
  amount: number;
  next_due_date: string;
  account_id: string;
};

const MIN_HORIZON_DAYS = 90;
const MAX_HORIZON_DAYS = 3650;

function addDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

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

  const todayISO = new Date().toISOString().slice(0, 10);

  // Payments into the card: bills (e.g. a weekly card payment on the Bills
  // account) that point at this card. They're read straight from the source
  // account's planned entries, so editing or clearing them over there is
  // always reflected here — nothing is stored twice.
  const [{ data: paymentRulesData }, { data: cardRulesData }] = await Promise.all([
    supabase
      .from("recurring_rules")
      .select("id, description, kind, frequency, amount, next_due_date, account_id")
      .eq("transfer_to_account_id", card.id)
      .eq("active", true),
    supabase
      .from("recurring_rules")
      .select("id, description, kind, frequency, amount, next_due_date, account_id")
      .eq("account_id", card.id)
      .eq("active", true),
  ]);
  const paymentRules = (paymentRulesData ?? []) as RuleRow[];
  const cardRules = (cardRulesData ?? []) as RuleRow[];
  const paymentRuleIds = paymentRules.map((r) => r.id);
  const allRuleIds = [...paymentRuleIds, ...cardRules.map((r) => r.id)];

  // Work out how far to forecast: until the balance is back to zero (and the
  // limit fully restored), but never less than 90 days. Anything already
  // entered further out is always included regardless.
  const [
    { data: knownCard },
    { data: knownPayments },
    { data: knownOneOffs },
    { data: knownRuleTx },
    { data: skips },
    { data: startSnap },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("date, amount")
      .eq("account_id", card.id)
      .eq("status", "planned"),
    paymentRuleIds.length > 0
      ? supabase
          .from("transactions")
          .select("date, amount")
          .in("recurring_rule_id", paymentRuleIds)
          .eq("status", "planned")
      : Promise.resolve({ data: [] as { date: string; amount: number }[] }),
    supabase
      .from("transactions")
      .select("date, amount")
      .eq("transfer_to_account_id", card.id)
      .eq("status", "planned"),
    // Every status, so a bill already marked paid today isn't regenerated.
    allRuleIds.length > 0
      ? supabase
          .from("transactions")
          .select("recurring_rule_id, date")
          .in("recurring_rule_id", allRuleIds)
          .gte("date", todayISO)
      : Promise.resolve({ data: [] as { recurring_rule_id: string; date: string }[] }),
    allRuleIds.length > 0
      ? supabase
          .from("recurring_rule_skips")
          .select("recurring_rule_id, date")
          .in("recurring_rule_id", allRuleIds)
      : Promise.resolve({ data: [] as { recurring_rule_id: string; date: string }[] }),
    supabase
      .from("balance_snapshots")
      .select("balance")
      .eq("account_id", card.id)
      .order("as_of_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const takenKeys = new Set([
    ...(knownRuleTx ?? []).map((t) => `${t.recurring_rule_id}:${t.date}`),
    ...(skips ?? []).map((t) => `${t.recurring_rule_id}:${t.date}`),
  ]);

  // Occurrences of a rule that aren't stored yet, through a given date.
  function virtualEvents(rules: RuleRow[], through: string, sign: 1 | -1) {
    const out: { date: string; amount: number; ruleId: string; description: string }[] = [];
    for (const rule of rules) {
      for (const date of occurrencesInRange(rule, todayISO, through)) {
        if (takenKeys.has(`${rule.id}:${date}`)) continue;
        out.push({
          date,
          amount: sign * Math.abs(rule.amount) * (sign === 1 ? 1 : rule.kind === "income" ? -1 : 1),
          ruleId: rule.id,
          description: rule.description,
        });
      }
    }
    return out;
  }

  const realEvents = [
    ...(knownCard ?? []),
    ...(knownPayments ?? []).map((t) => ({ date: t.date, amount: Math.abs(t.amount) })),
    ...(knownOneOffs ?? []).map((t) => ({ date: t.date, amount: Math.abs(t.amount) })),
  ];

  let horizonDays = MIN_HORIZON_DAYS;
  const startBalance = startSnap?.balance ?? 0;
  if (startBalance < 0) {
    for (const h of [90, 180, 365, 730, 1460, MAX_HORIZON_DAYS]) {
      const through = addDaysISO(h);
      const events = [
        ...realEvents,
        ...virtualEvents(paymentRules, through, 1),
        ...virtualEvents(cardRules, through, -1),
      ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.amount - a.amount));
      let bal = startBalance;
      let clearedOn: string | null = null;
      for (const e of events) {
        bal += e.amount;
        if (bal >= 0) {
          clearedOn = e.date;
          break;
        }
      }
      horizonDays = h;
      if (clearedOn) {
        const days = Math.ceil(
          (new Date(clearedOn).getTime() - new Date(todayISO).getTime()) / 86_400_000,
        );
        horizonDays = Math.max(MIN_HORIZON_DAYS, days);
        break;
      }
    }
  }
  const horizonISO = addDaysISO(horizonDays);

  // Bills assigned to the card generate their own planned purchases here.
  await materializePlannedTransactions(supabase, card.id, horizonDays);
  const paymentRuleIdsForRows = paymentRuleIds;

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
    paymentRuleIdsForRows.length > 0
      ? supabase
          .from("transactions")
          .select("id, account_id, date, amount, status, merchant, recurring_rule_id")
          .in("recurring_rule_id", paymentRuleIdsForRows)
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
    sourceAccountId: t.account_id,
    id: `payment-${t.id}`,
    account_id: card.id,
    // Money leaving the paying account lands on the card as a credit.
    amount: Math.abs(t.amount),
    merchant: t.merchant ?? "Card payment",
    recurring_rule_id: null,
    readOnly: true,
  }));

  // Payments from repeating bills that haven't been stored on the paying
  // account yet (it only stores 90 days ahead). Shown for the running
  // balance; they become real, markable entries as they come into range.
  const storedThrough = addDaysISO(90);
  const futurePayments: SavedTransaction[] = virtualEvents(paymentRules, horizonISO, 1)
    .filter((e) => e.date > storedThrough)
    .map((e) => ({
      id: `payment-future-${e.ruleId}-${e.date}`,
      account_id: card.id,
      date: e.date,
      amount: e.amount,
      status: "planned" as const,
      merchant: e.description,
      recurring_rule_id: null,
      readOnly: true,
      futureOnly: true,
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
      initialTransactions={[...(ownTransactions ?? []), ...payments, ...futurePayments]}
      balanceHistory={history ?? []}
      existingCategories={Array.from(new Set((categories ?? []).map((c) => c.name)))}
    />
  );
}
