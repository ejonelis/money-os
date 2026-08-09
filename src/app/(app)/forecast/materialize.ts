import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { occurrencesInRange } from "@/lib/recurrence";

const FORECAST_HORIZON_DAYS = 90;

/**
 * Turns each active recurring bill on this account into real `planned`
 * transactions for the next 90 days, skipping any date already
 * materialized. Runs on every forecast page load — cheap, idempotent, and
 * means there's no background job to operate.
 */
export async function materializePlannedTransactions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  accountId: string,
) {
  const today = new Date();
  const fromISO = today.toISOString().slice(0, 10);
  const through = new Date(today);
  through.setDate(through.getDate() + FORECAST_HORIZON_DAYS);
  const throughISO = through.toISOString().slice(0, 10);

  const { data: rules } = await supabase
    .from("recurring_rules")
    .select("id, description, kind, frequency, amount, next_due_date")
    .eq("account_id", accountId)
    .eq("active", true);

  if (!rules || rules.length === 0) return;

  const { data: existing } = await supabase
    .from("transactions")
    .select("recurring_rule_id, date")
    .eq("account_id", accountId)
    .not("recurring_rule_id", "is", null)
    .gte("date", fromISO)
    .lte("date", throughISO);

  const existingKeys = new Set(
    (existing ?? []).map((t) => `${t.recurring_rule_id}:${t.date}`),
  );

  const toInsert: {
    account_id: string;
    date: string;
    amount: number;
    status: "planned";
    recurring_rule_id: string;
    merchant: string;
  }[] = [];

  for (const rule of rules) {
    const dates = occurrencesInRange(rule, fromISO, throughISO);
    for (const date of dates) {
      const key = `${rule.id}:${date}`;
      if (existingKeys.has(key)) continue;
      toInsert.push({
        account_id: accountId,
        date,
        amount: rule.kind === "income" ? rule.amount : -rule.amount,
        status: "planned",
        recurring_rule_id: rule.id,
        merchant: rule.description,
      });
    }
  }

  if (toInsert.length > 0) {
    await supabase.from("transactions").insert(toInsert);
  }
}
