"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signInWithPassword } from "./actions";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [state, action, pending] = useActionState(
    signInWithPassword,
    undefined,
  );
  const router = useRouter();
  const [recovering, setRecovering] = useState(false);
  const [, startTransition] = useTransition();

  // Admin-generated password-setup links use the implicit hash-fragment
  // flow (#access_token=...), which never reaches the server — unlike the
  // ?code= flow our /auth/callback route handles. This has to run client-side.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token") || !hash.includes("type=recovery")) {
      return;
    }

    const params = new URLSearchParams(hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return;

    startTransition(() => setRecovering(true));
    const supabase = createClient();
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (!error) {
        router.replace("/account/set-password");
      } else {
        setRecovering(false);
      }
    });
  }, [router]);

  if (recovering) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <p className="text-sm text-foreground/60">Signing you in…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Money OS</h1>
          <p className="text-sm text-foreground/60">Sign in to your household.</p>
        </div>

        <form action={action} className="space-y-3">
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-foreground/40 focus:border-foreground/40"
          />
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-foreground/40 focus:border-foreground/40"
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
          {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
        </form>
      </div>
    </main>
  );
}
