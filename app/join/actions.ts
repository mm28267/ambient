import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Join a group via invite code.
 *
 * Calls the Postgres function join_group_by_code which validates the invite,
 * adds the caller to the group atomically, and returns the group_id.
 *
 * This is a regular helper (not a Server Action) because we call it during
 * Server Component render in /join/[code]. Server Actions can't trigger
 * cache revalidation during render.
 */
export async function joinGroup(inviteCode: string): Promise<{ groupId?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/?next=/join/${inviteCode}`);

  const { data: groupId, error } = await supabase.rpc("join_group_by_code", {
    p_invite_code: inviteCode,
  });

  if (error) {
    console.error("Join failed:", error);
    if (error.code === "P0001") return { error: "Invite not found" };
    if (error.code === "P0002") return { error: "Invite has expired" };
    return { error: "Couldn't join group" };
  }

  return { groupId };
}
