"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { revalidateForecasts } from "@/lib/revalidate-forecasts";
import { requireHouseholdId } from "@/lib/household";
import { FREQUENCIES, type Frequency } from "@/lib/recurrence";
import { deleteBill, setBillActive } from "../bills/actions";

const txSchema = z.object({
  account_id: z.string().uuid(),
  date: z.string().min(1, "Date is required."),
  description: z.string().trim().min(1, "Description is required."),
  kind: z.enum(["expense", "income"]),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  on_hold: z.coerce.boolean().optional(),
});

export type TxStatus = "planned" | "actual" | "on_hold";

export type SavedTransaction = {
  id: string;
  account_id: string;
  date: string;
  amount: number;
  status: TxStatus;
  merchant: string | null;
  recurring_rule_id: string | null;
  // Mirrored in from another account's forecast (e.g. a card payment from
  // Bills). Shown for the running balance but edited at its source.
  readOnly?: boolean;
  // For mirrored card payments: the account the money leaves from.
  sourceAccountId?: string;
  // Not stored yet (beyond the paying account's 90 days): can't be marked paid.
  futureOnly?: boolean;
};

export type TxFormState =
  | { error?: string; transaction?: SavedTransaction; ruleUpdated?: string }
  | undefined;

const TX_COLUMNS =
  "id, account_id, date, amount, status, merchant, recurring_rule_id";

function parseForm(formData: FormData) {
  return txSchema.safeParse({
    account_id: formData.get("account_id"),
    date: formData.get("date"),
    description: formData.get("description"),
    kind: formData.get("kind"),
    amount: formData.get("amount"),
    on_hold: formData.get("on_hold") === "on",
  });
}

export async function addTransaction(
  _prevState: TxFormState,
  formData: FormData,
): Promise<TxFormState> {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  // "Repeats" — create a recurring bill instead of a one-off entry. The
  // forecast then generates its planned occurrences on the next load, and
  // it shows up in Monthly Bills like any other bill.
  const repeat = formData.get("repeat");
  if (typeof repeat === "string" && repeat !== "none") {
    if (!FREQUENCIES.includes(repeat as Frequency)) {
      return { error: "Choose how often this repeats." };
    }
    const householdId = await requireHouseholdId();
    const { data: rule, error: ruleError } = await supabase
      .from("recurring_rules")
      .insert({
        household_id: householdId,
        account_id: formData.get("rule_account_id") || parsed.data.account_id,
        description: parsed.data.description,
        kind: parsed.data.kind,
        frequency: repeat,
        amount: parsed.data.amount,
        next_due_date: parsed.data.date,
        transfer_to_account_id: formData.get("transfer_to_account_id") || null,
      })
      .select("id")
      .single();
    if (ruleError || !rule) {
      return { error: ruleError?.message ?? "Could not create the repeating entry." };
    }
    revalidateForecasts();
    revalidatePath("/bills");
    // Reuses the "rule changed" path: closes the popup and refreshes.
    return { ruleUpdated: rule.id };
  }

  const signedAmount =
    parsed.data.kind === "income" ? parsed.data.amount : -parsed.data.amount;

  // A one-off that pays into another account (e.g. an extra card payment
  // entered on Bills): it lives on the paying account and the receiving
  // account's forecast reads it from there.
  const transferTo = (formData.get("transfer_to_account_id") as string) || null;

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      account_id: formData.get("rule_account_id") || parsed.data.account_id,
      date: parsed.data.date,
      amount: signedAmount,
      merchant: parsed.data.description,
      status: parsed.data.on_hold ? "on_hold" : "planned",
      ...(transferTo ? { transfer_to_account_id: transferTo } : {}),
    })
    .select(TX_COLUMNS)
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not add entry." };
  }

  revalidateForecasts();
  // The entry may belong to the other account's page, so refresh instead
  // of adding it to this page's list.
  if (transferTo) return { ruleUpdated: data.id };
  return { transaction: data as SavedTransaction };
}

export async function updateTransaction(
  id: string,
  _prevState: TxFormState,
  formData: FormData,
): Promise<TxFormState> {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const scope = formData.get("scope"); // "occurrence" (default) | "rule"
  const recurringRuleId = formData.get("recurring_rule_id");
  const originalDate = formData.get("original_date");
  const hasRule = typeof recurringRuleId === "string" && recurringRuleId.length > 0;

  const supabase = await createClient();
  const signedAmount =
    parsed.data.kind === "income" ? parsed.data.amount : -parsed.data.amount;

  // "This bill going forward" — edits the recurring rule itself (so
  // Monthly Bills reflects it too) and clears still-planned occurrences so
  // Forecast regenerates them fresh under the new amount/date next load.
  if (scope === "rule" && hasRule) {
    await supabase
      .from("recurring_rules")
      .update({
        description: parsed.data.description,
        kind: parsed.data.kind,
        amount: parsed.data.amount,
        next_due_date: parsed.data.date,
      })
      .eq("id", recurringRuleId as string);

    await supabase
      .from("transactions")
      .delete()
      .eq("recurring_rule_id", recurringRuleId as string)
      .eq("status", "planned");

    revalidatePath("/bills");
    revalidateForecasts();
    return { ruleUpdated: recurringRuleId as string };
  }

  // "Just this occurrence" — detach it from the rule so a later rule-wide
  // edit won't sweep up this one-off correction, and mark the original
  // date as skipped so materialize.ts doesn't regenerate a duplicate there.
  const { data, error } = await supabase
    .from("transactions")
    .update({
      date: parsed.data.date,
      amount: signedAmount,
      merchant: parsed.data.description,
      status: parsed.data.on_hold ? "on_hold" : "planned",
      ...(hasRule ? { recurring_rule_id: null } : {}),
    })
    .eq("id", id)
    .select(TX_COLUMNS)
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not update entry." };
  }

  if (hasRule && typeof originalDate === "string" && originalDate) {
    await supabase.from("recurring_rule_skips").upsert(
      { recurring_rule_id: recurringRuleId as string, date: originalDate },
      { onConflict: "recurring_rule_id,date" },
    );
  }

  revalidateForecasts();
  return { transaction: data as SavedTransaction };
}

export async function deleteTransaction(id: string) {
  const supabase = await createClient();
  await supabase.from("transactions").delete().eq("id", id);
  revalidateForecasts();
}

// "Delete just this one" — removes the occurrence and remembers not to
// regenerate it.
export async function deleteOccurrenceOnly(
  id: string,
  recurringRuleId: string | null,
  date: string,
) {
  const supabase = await createClient();
  if (recurringRuleId) {
    await supabase.from("recurring_rule_skips").upsert(
      { recurring_rule_id: recurringRuleId, date },
      { onConflict: "recurring_rule_id,date" },
    );
  }
  await supabase.from("transactions").delete().eq("id", id);
  revalidateForecasts();
}

// "Delete all" — clears every still-planned occurrence of this bill from
// Forecast. Whether the bill itself also goes is a separate follow-up
// choice (removeBillEntirely / pauseBillFromForecast).
export async function deleteAllFutureOccurrences(recurringRuleId: string) {
  const supabase = await createClient();
  await supabase
    .from("transactions")
    .delete()
    .eq("recurring_rule_id", recurringRuleId)
    .eq("status", "planned");
  revalidateForecasts();
}

export async function removeBillEntirely(recurringRuleId: string) {
  await deleteBill(recurringRuleId);
  revalidateForecasts();
}

// Keeps the bill in Monthly Bills but stops it from generating new
// occurrences — the "just remove it from Forecast" half of the choice.
export async function pauseBillFromForecast(recurringRuleId: string) {
  await setBillActive(recurringRuleId, false);
  revalidateForecasts();
}

export async function setTransactionStatus(id: string, status: TxStatus) {
  const supabase = await createClient();
  await supabase.from("transactions").update({ status }).eq("id", id);
  revalidateForecasts();
}

// Marking something cleared means it's really happened — the displayed
// balance should reflect that immediately, not wait for the next manual
// check-in. Records the adjusted figure as today's balance alongside the
// status flip.
export async function clearTransaction(
  id: string,
  accountId: string,
  newBalance: number,
) {
  const supabase = await createClient();
  const asOfDate = new Date().toISOString().slice(0, 10);
  await Promise.all([
    supabase.from("transactions").update({ status: "actual" }).eq("id", id),
    supabase.from("balance_snapshots").insert({
      account_id: accountId,
      as_of_date: asOfDate,
      balance: newBalance,
    }),
  ]);
  revalidateForecasts();
  revalidatePath("/balances");
}

// Marks a card payment (entered on another account, e.g. Bills) as paid:
// the source entry becomes actual, the card balance rises by the payment,
// and the paying account's balance drops by the same amount.
export async function clearCardPayment(
  sourceTxId: string,
  cardAccountId: string,
  newCardBalance: number,
) {
  const supabase = await createClient();
  const asOfDate = new Date().toISOString().slice(0, 10);

  const { data: tx } = await supabase
    .from("transactions")
    .select("account_id, amount")
    .eq("id", sourceTxId)
    .single();
  if (!tx) return;

  await supabase.from("transactions").update({ status: "actual" }).eq("id", sourceTxId);
  await supabase.from("balance_snapshots").insert({
    account_id: cardAccountId,
    as_of_date: asOfDate,
    balance: newCardBalance,
  });

  const { data: src } = await supabase
    .from("balance_snapshots")
    .select("balance")
    .eq("account_id", tx.account_id)
    .order("as_of_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (src) {
    await supabase.from("balance_snapshots").insert({
      account_id: tx.account_id,
      as_of_date: asOfDate,
      balance: src.balance - Math.abs(tx.amount),
    });
  }

  revalidateForecasts();
  revalidatePath("/balances");
}

export async function setCreditLimit(accountId: string, limit: number | null) {
  const supabase = await createClient();
  await supabase
    .from("accounts")
    .update({ credit_limit: limit })
    .eq("id", accountId);
  revalidateForecasts();
}
