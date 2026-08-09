"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const txSchema = z.object({
  account_id: z.string().uuid(),
  date: z.string().min(1, "Date is required."),
  description: z.string().trim().min(1, "Description is required."),
  kind: z.enum(["expense", "income"]),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
});

export type SavedTransaction = {
  id: string;
  account_id: string;
  date: string;
  amount: number;
  status: "planned" | "actual";
  merchant: string | null;
  recurring_rule_id: string | null;
};

export type TxFormState =
  | { error?: string; transaction?: SavedTransaction }
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
  const signedAmount =
    parsed.data.kind === "income" ? parsed.data.amount : -parsed.data.amount;

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      account_id: parsed.data.account_id,
      date: parsed.data.date,
      amount: signedAmount,
      merchant: parsed.data.description,
      status: "planned",
    })
    .select(TX_COLUMNS)
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not add entry." };
  }

  revalidatePath("/forecast");
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

  const supabase = await createClient();
  const signedAmount =
    parsed.data.kind === "income" ? parsed.data.amount : -parsed.data.amount;

  const { data, error } = await supabase
    .from("transactions")
    .update({
      date: parsed.data.date,
      amount: signedAmount,
      merchant: parsed.data.description,
    })
    .eq("id", id)
    .select(TX_COLUMNS)
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not update entry." };
  }

  revalidatePath("/forecast");
  return { transaction: data as SavedTransaction };
}

export async function deleteTransaction(id: string) {
  const supabase = await createClient();
  await supabase.from("transactions").delete().eq("id", id);
  revalidatePath("/forecast");
}

export async function setTransactionStatus(
  id: string,
  status: "planned" | "actual",
) {
  const supabase = await createClient();
  await supabase.from("transactions").update({ status }).eq("id", id);
  revalidatePath("/forecast");
}
