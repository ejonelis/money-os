"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type SignInState = { error?: string } | undefined;

// Money OS is a two-person household app, not a public sign-up product —
// only these two accounts exist, and password sign-in never creates new
// ones, so this is a defense-in-depth check, not the only gate.
const ALLOWED_EMAILS = ["e.jonelis@gmail.com", "a.jonele@gmail.com"];

export async function signInWithPassword(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = (formData.get("email") as string | null)?.trim();
  const password = formData.get("password") as string | null;

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  if (!ALLOWED_EMAILS.includes(email.toLowerCase())) {
    return { error: "This is a private household app — that email isn't on the list." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Wrong email or password." };
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
