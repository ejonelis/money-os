"use client";

import { useActionState } from "react";
import { signInWithEmail } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(
    signInWithEmail,
    undefined,
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Money OS</h1>
          <p className="text-sm text-foreground/60">
            Sign in with a magic link sent to your email.
          </p>
        </div>

        {state?.success ? (
          <p className="rounded-md border border-emerald-600/30 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
            Check your email for a sign-in link.
          </p>
        ) : (
          <form action={action} className="space-y-3">
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-foreground/40 focus:border-foreground/40"
            />
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {pending ? "Sending link…" : "Send magic link"}
            </button>
            {state?.error && (
              <p className="text-sm text-red-500">{state.error}</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
