"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const txSchema = z.object({
  account_id: z.string().uuid(),
  date: z.string().min(1, "Date is required."),
  description: z.string().trim().min(1, "Description is required."),
  signed_amount: z.coerce.number().refine((n) => n !== 0, "Amount can't be zero."),
});

export type SavedTransaction = {
  id: string;
  account_id: string;
  date: string;
  amount: number;
  merchant: string | null;
};

export type TxFormState =
  | { error?: string; transaction?: SavedTransaction }
  | undefined;

const TX_COLUMNS = "id, account_id, date, amount, merchant";

function parseForm(formData: FormData) {
  return txSchema.safeParse({
    account_id: formData.get("account_id"),
    date: formData.get("date"),
    description: formData.get("description"),
    signed_amount: formData.get("signed_amount"),
  });
}

export async function addLedgerEntry(
  _prevState: TxFormState,
  formData: FormData,
): Promise<TxFormState> {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      account_id: parsed.data.account_id,
      date: parsed.data.date,
      amount: parsed.data.signed_amount,
      merchant: parsed.data.description,
      status: "actual",
    })
    .select(TX_COLUMNS)
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not add entry." };
  }

  revalidatePath("/accounts");
  return { transaction: data as SavedTransaction };
}

export async function updateLedgerEntry(
  id: string,
  _prevState: TxFormState,
  formData: FormData,
): Promise<TxFormState> {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("transactions")
    .update({
      date: parsed.data.date,
      amount: parsed.data.signed_amount,
      merchant: parsed.data.description,
    })
    .eq("id", id)
    .select(TX_COLUMNS)
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not update entry." };
  }

  revalidatePath("/accounts");
  return { transaction: data as SavedTransaction };
}

export async function deleteLedgerEntry(id: string) {
  const supabase = await createClient();
  await supabase.from("transactions").delete().eq("id", id);
  revalidatePath("/accounts");
}
