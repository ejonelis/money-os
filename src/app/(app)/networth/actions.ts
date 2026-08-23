"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHouseholdId } from "@/lib/household";

const accountSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  group_label: z.string().trim().min(1, "Category is required."),
  is_liability: z.coerce.boolean(),
  balance: z.coerce.number().min(0, "Enter a value of 0 or more."),
  as_of_date: z.string().min(1, "Date is required."),
});

export type SavedAccount = {
  id: string;
  name: string;
  group_label: string | null;
  is_liability: boolean;
  archived: boolean;
};

export type SavedValue = {
  account_id: string;
  as_of_date: string;
  balance: number;
  created_at: string;
};

export type AccountFormState =
  | { error?: string; account?: SavedAccount; snapshot?: SavedValue }
  | undefined;

function parseForm(formData: FormData) {
  return accountSchema.safeParse({
    name: formData.get("name"),
    group_label: formData.get("group_label"),
    is_liability: formData.get("is_liability") === "on",
    balance: formData.get("balance"),
    as_of_date: formData.get("as_of_date"),
  });
}

export async function createAccount(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const householdId = await requireHouseholdId();
  const supabase = await createClient();

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .insert({
      household_id: householdId,
      name: parsed.data.name,
      group_label: parsed.data.group_label,
      is_liability: parsed.data.is_liability,
      type: parsed.data.is_liability ? "debt" : "other",
    })
    .select("id, name, group_label, is_liability, archived")
    .single();

  if (accountError || !account) {
    return { error: accountError?.message ?? "Could not create account." };
  }

  const balance = parsed.data.is_liability
    ? -Math.abs(parsed.data.balance)
    : parsed.data.balance;

  const { data: snapshot, error: snapshotError } = await supabase
    .from("balance_snapshots")
    .insert({
      account_id: account.id,
      as_of_date: parsed.data.as_of_date,
      balance,
    })
    .select("account_id, as_of_date, balance, created_at")
    .single();

  if (snapshotError || !snapshot) {
    return { error: snapshotError?.message ?? "Could not save value." };
  }

  revalidatePath("/networth");
  return { account: account as SavedAccount, snapshot: snapshot as SavedValue };
}

export async function updateAccount(
  id: string,
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .update({
      name: parsed.data.name,
      group_label: parsed.data.group_label,
      is_liability: parsed.data.is_liability,
    })
    .eq("id", id)
    .select("id, name, group_label, is_liability, archived")
    .single();

  if (accountError || !account) {
    return { error: accountError?.message ?? "Could not update account." };
  }

  const balance = parsed.data.is_liability
    ? -Math.abs(parsed.data.balance)
    : parsed.data.balance;

  const { data: snapshot, error: snapshotError } = await supabase
    .from("balance_snapshots")
    .insert({
      account_id: id,
      as_of_date: parsed.data.as_of_date,
      balance,
    })
    .select("account_id, as_of_date, balance, created_at")
    .single();

  if (snapshotError || !snapshot) {
    return { error: snapshotError?.message ?? "Could not save value." };
  }

  revalidatePath("/networth");
  return { account: account as SavedAccount, snapshot: snapshot as SavedValue };
}

export async function archiveAccount(id: string) {
  const supabase = await createClient();
  await supabase.from("accounts").update({ archived: true }).eq("id", id);
  revalidatePath("/networth");
}
