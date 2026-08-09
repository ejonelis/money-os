import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-sm text-foreground/60">
        Signed in as {user?.email}. Accounts, the plan-and-confirm ledger, and
        net worth land here next.
      </p>
    </div>
  );
}
