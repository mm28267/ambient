"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Disconnect Google. Deletes the user's row from user_google_tokens, clearing
 * tokens. Used when the user wants to revoke / re-grant access (e.g. after a
 * failed scope grant) or just to stop sharing.
 */
export async function disconnectGoogle(): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_google_tokens")
    .delete()
    .eq("user_id", user.id);
  if (error) {
    console.error("Failed to disconnect Google:", error);
    return { error: "Couldn't disconnect." };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}
