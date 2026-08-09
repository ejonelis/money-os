"use client";

import { useActionState } from "react";
import { signInWithPassword } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(
    signInWithPassword,
    undefined,
  );

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
