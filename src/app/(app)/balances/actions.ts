"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const FIELD_PREFIX = "balance_";

const dateSchema = z.string().min(1, "Date is required.");

export type SavedSnapshot = {
  account_id: string;
  as_of_date: string;
  balance: number;
  created_at: string;
};

export type SaveBalancesState =
  | { error?: string; saved?: SavedSnapshot[] }
  | undefined;

export async function saveDailyBalances(
  _prevState: SaveBalancesState,
  formData: FormData,
): Promise<SaveBalancesState> {
  const dateResult = dateSchema.safeParse(formData.get("date"));
  if (!dateResult.success) {
    return { error: dateResult.error.issues[0].message };
  }
  const asOfDate = dateResult.data;

  const rows: { account_id: string; as_of_date: string; balance: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(FIELD_PREFIX)) continue;
    const raw = String(value).trim();
    if (raw === "") continue;
    const balance = Number(raw);
    if (Number.isNaN(balance)) continue;
    rows.push({
      account_id: key.slice(FIELD_PREFIX.length),
      as_of_date: asOfDate,
      balance,
    });
  }

  if (rows.length === 0) {
    return { error: "Enter at least one balance." };
  }

  const supabase = await createClient();

  // Liability accounts (credit cards, loans) always net worth as negative.
  // Whatever sign the user typed, normalize it — so entering the plain
  // amount owed just works, and an accidental minus sign is harmless.
  const { data: liabilityAccounts } = await supabase
    .from("accounts")
    .select("id")
    .in(
      "id",
      rows.map((r) => r.account_id),
    )
    .eq("is_liability", true);
  const liabilityIds = new Set((liabilityAccounts ?? []).map((a) => a.id));

  const normalizedRows = rows.map((r) => ({
    ...r,
    balance: liabilityIds.has(r.account_id) ? -Math.abs(r.balance) : r.balance,
  }));

  const { data, error } = await supabase
    .from("balance_snapshots")
    .insert(normalizedRows)
    .select("account_id, as_of_date, balance, created_at");

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/balances");
  return { saved: (data ?? []) as SavedSnapshot[] };
}
