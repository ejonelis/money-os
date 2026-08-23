"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHouseholdId } from "@/lib/household";
import { FREQUENCIES, type Frequency } from "@/lib/recurrence";

const billSchema = z.object({
  description: z.string().trim().min(1, "Description is required."),
  account_id: z.string().uuid("Choose an account."),
  kind: z.enum(["expense", "income"]),
  frequency: z.enum(FREQUENCIES),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  next_due_date: z.string().min(1, "Next due date is required."),
});

export type BillKind = "expense" | "income";

export type SavedBill = {
  id: string;
  description: string;
  account_id: string;
  kind: BillKind;
  frequency: Frequency;
  amount: number;
  next_due_date: string;
  active: boolean;
};

export type BillFormState = { error?: string; bill?: SavedBill } | undefined;

const BILL_COLUMNS =
  "id, description, account_id, kind, frequency, amount, next_due_date, active";

function parseForm(formData: FormData) {
  return billSchema.safeParse({
    description: formData.get("description"),
    account_id: formData.get("account_id"),
    kind: formData.get("kind"),
    frequency: formData.get("frequency"),
    amount: formData.get("amount"),
    next_due_date: formData.get("next_due_date"),
  });
}

export async function createBill(
  _prevState: BillFormState,
  formData: FormData,
): Promise<BillFormState> {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const householdId = await requireHouseholdId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("recurring_rules")
    .insert({ household_id: householdId, ...parsed.data })
    .select(BILL_COLUMNS)
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not create bill." };
  }

  revalidatePath("/bills");
  revalidatePath("/forecast");
  return { bill: data as SavedBill };
}

export async function updateBill(
  id: string,
  _prevState: BillFormState,
  formData: FormData,
): Promise<BillFormState> {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recurring_rules")
    .update(parsed.data)
    .eq("id", id)
    .select(BILL_COLUMNS)
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not update bill." };
  }

  // Still-planned occurrences were materialized under the old amount/date/
  // frequency — clear them out so Forecast regenerates fresh ones from the
  // updated rule on its next load. Cleared/actual history is untouched.
  await supabase
    .from("transactions")
    .delete()
    .eq("recurring_rule_id", id)
    .eq("status", "planned");

  revalidatePath("/bills");
  revalidatePath("/forecast");
  return { bill: data as SavedBill };
}

export async function setBillActive(id: string, active: boolean) {
  const supabase = await createClient();
  await supabase.from("recurring_rules").update({ active }).eq("id", id);
  revalidatePath("/bills");
  revalidatePath("/forecast");
}

export async function deleteBill(id: string) {
  const supabase = await createClient();
  // Planned occurrences shouldn't linger in Forecast once the bill itself
  // is gone; cleared/actual history stays (the FK just detaches it).
  await supabase
    .from("transactions")
    .delete()
    .eq("recurring_rule_id", id)
    .eq("status", "planned");
  await supabase.from("recurring_rules").delete().eq("id", id);
  revalidatePath("/bills");
  revalidatePath("/forecast");
}
