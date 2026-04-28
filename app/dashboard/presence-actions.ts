"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Updates the current user's timezone (if not already set) and refreshes
 * their last_seen_at timestamp. Called by a small client component on
 * dashboard mount + heartbeat.
 *
 * RLS allows the user to UPDATE their own row, so no admin client needed.
 */
export async function pingPresence(timezone: string | null): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // We always update last_seen_at; only update timezone if a non-UTC value
  // arrived from the client (so we don't overwrite real values with default).
  const update: { last_seen_at: string; timezone?: string } = {
    last_seen_at: new Date().toISOString(),
  };
  if (timezone && timezone !== "UTC") update.timezone = timezone;

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id);

  if (error) console.error("pingPresence failed:", error);
}
