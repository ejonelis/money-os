import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-foreground/10">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <nav className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold tracking-tight">
              Money OS
            </Link>
            <Link
              href="/dashboard"
              className="text-sm text-foreground/60 hover:text-foreground"
            >
              Dashboard
            </Link>
            <Link
              href="/bills"
              className="text-sm text-foreground/60 hover:text-foreground"
            >
              Bills
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link
              href="/account/set-password"
              className="text-sm text-foreground/60 hover:text-foreground"
            >
              {user.email}
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-foreground/15 px-3 py-1.5 text-sm"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
