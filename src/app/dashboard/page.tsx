import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Money OS</h1>
        <p className="text-sm text-foreground/60">
          Signed in as {user.email}. Accounts, the plan-and-confirm ledger,
          and net worth land here next.
        </p>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-foreground/15 px-3 py-1.5 text-sm"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
