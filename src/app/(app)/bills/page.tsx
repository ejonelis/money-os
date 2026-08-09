import { createClient } from "@/lib/supabase/server";
import { requireHouseholdId } from "@/lib/household";
import { BillsClient } from "./BillsClient";

export default async function BillsPage() {
  const householdId = await requireHouseholdId();
  const supabase = await createClient();

  const [{ data: bills, error: billsError }, { data: accounts, error: accountsError }] =
    await Promise.all([
      supabase
        .from("recurring_rules")
        .select("id, description, account_id, kind, frequency, amount, next_due_date, active")
        .eq("household_id", householdId)
        .order("next_due_date", { ascending: true }),
      supabase
        .from("accounts")
        .select("id, name")
        .eq("household_id", householdId)
        .eq("archived", false)
        .order("name", { ascending: true }),
    ]);

  if (billsError || accountsError) {
    throw new Error(billsError?.message ?? accountsError?.message);
  }

  return (
    <BillsClient initialBills={bills ?? []} accounts={accounts ?? []} />
  );
}
