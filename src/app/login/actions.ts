"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type SignInState = { error?: string; success?: boolean } | undefined;

// Money OS is a two-person household app, not a public sign-up product —
// only these two accounts should ever exist.
const ALLOWED_EMAILS = ["e.jonelis@gmail.com", "a.jonele@gmail.com"];

async function siteOrigin() {
  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

export async function signInWithEmail(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = (formData.get("email") as string | null)?.trim();

  if (!email) {
    return { error: "Enter an email address." };
  }

  if (!ALLOWED_EMAILS.includes(email.toLowerCase())) {
    return { error: "This is a private household app — that email isn't on the list." };
  }

  const supabase = await createClient();
  const origin = await siteOrigin();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      shouldCreateUser: false,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
