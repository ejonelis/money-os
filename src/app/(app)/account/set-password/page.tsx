"use client";

import { useActionState } from "react";
import { setPassword } from "../actions";

export default function SetPasswordPage() {
  const [state, action, pending] = useActionState(setPassword, undefined);

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Set a password</h1>
        <p className="text-sm text-foreground/60">
          Choose a password for signing in going forward.
        </p>
      </div>
      <form action={action} className="space-y-3">
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="New password"
          className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-foreground/40 focus:border-foreground/40"
        />
        <input
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Confirm password"
          className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-foreground/40 focus:border-foreground/40"
        />
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save password"}
        </button>
        {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      </form>
    </div>
  );
}
