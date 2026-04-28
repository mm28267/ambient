"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateInviteCode } from "@/lib/utils/invite-code";

/**
 * Create a new group. Called from <form action={createGroup}>.
 *
 * Uses the SECURITY DEFINER `create_group` function in Postgres so that
 * group creation, adding the creator as a member, and generating the initial
 * invite all happen atomically without RLS transition issues.
 */
export async function createGroup(formData: FormData) {
  const name = formData.get("name")?.toString().trim();
  const cadenceDays = Number(formData.get("cadence_days"));
  const emoji = formData.get("emoji")?.toString().trim() || null;

  if (!name) {
    throw new Error("Group name is required.");
  }
  if (![7, 14, 30].includes(cadenceDays)) {
    throw new Error("Invalid cadence.");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const inviteCode = generateInviteCode();

  const { data: groupId, error } = await supabase.rpc("create_group", {
    p_name: name,
    p_emoji: emoji,
    p_cadence_days: cadenceDays,
    p_invite_code: inviteCode,
  });

  if (error || !groupId) {
    console.error("Failed to create group:", error);
    throw new Error("Failed to create group.");
  }

  revalidatePath("/dashboard");
  redirect(`/groups/${groupId}`);
}
