"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHouseholdId } from "@/lib/household";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type LeftoverEntry = {
  amount: number; // positive magnitude
  kind: "income" | "expense";
  payee: string;
  category: string; // free text; blank = uncategorized
};

export type ReconcileResult =
  | { error: string }
  | { balance: number; as_of_date: string };

async function getOrCreateCategory(
  supabase: Supabase,
  householdId: string,
  name: string,
  kind: "income" | "expense",
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data } = await supabase
    .from("categories")
    .upsert(
      { household_id: householdId, name: trimmed, kind },
      { onConflict: "household_id,name,kind" },
    )
    .select("id")
    .single();
  return data?.id ?? null;
}

// Reconciling a balance change: mark whichever still-planned bills actually
// went through as cleared, log anything left unexplained as a real
// (categorized) transaction, then save the confirmed balance — all derived
// from the real difference, so nothing gets double-counted.
export async function reconcileBalance(
  accountId: string,
  newBalance: number,
  clearedIds: string[],
  leftovers: LeftoverEntry[],
): Promise<ReconcileResult> {
  const householdId = await requireHouseholdId();
  const supabase = await createClient();
  const asOfDate = new Date().toISOString().slice(0, 10);

  if (clearedIds.length > 0) {
    await supabase
      .from("transactions")
      .update({ status: "actual" })
      .in("id", clearedIds);
  }

  for (const item of leftovers) {
    const magnitude = Math.abs(item.amount);
    if (!item.payee.trim() || magnitude === 0) continue;
    const categoryId = await getOrCreateCategory(
      supabase,
      householdId,
      item.category,
      item.kind,
    );
    await supabase.from("transactions").insert({
      account_id: accountId,
      date: asOfDate,
      amount: item.kind === "income" ? magnitude : -magnitude,
      merchant: item.payee.trim(),
      status: "actual",
      category_id: categoryId,
    });
  }

  const { data, error } = await supabase
    .from("balance_snapshots")
    .insert({ account_id: accountId, as_of_date: asOfDate, balance: newBalance })
    .select("balance, as_of_date")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not save balance." };
  }

  revalidatePath("/forecast");
  revalidatePath("/balances");
  revalidatePath("/accounts");
  return data as { balance: number; as_of_date: string };
}
