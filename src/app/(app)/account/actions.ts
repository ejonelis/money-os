"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const passwordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Passwords don't match.",
    path: ["confirm"],
  });

export type SetPasswordState = { error?: string } | undefined;

export async function setPassword(
  _prevState: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}
