import Image from "next/image";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-6">
      <Image
        src="/believe.png"
        alt="A taped-up hand-lettered BELIEVE sign"
        width={2140}
        height={1174}
        priority
        className="w-full max-w-md rounded-lg border border-foreground/10 shadow-sm"
      />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-foreground/60">
          Signed in as {user?.email}. Accounts, the plan-and-confirm ledger,
          and net worth land here next.
        </p>
      </div>
    </div>
  );
}
