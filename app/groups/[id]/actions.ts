"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Send a chat message to a group. Called from the chat composer's <form>.
 *
 * Returns the new message id on success or an error string on failure.
 * RLS makes sure non-members can't insert into a group they don't belong to.
 */
export async function sendMessage(
  groupId: string,
  body: string
): Promise<{ messageId?: string; error?: string }> {
  const trimmed = body.trim();
  if (!trimmed) return { error: "Message can't be empty." };
  if (trimmed.length > 2000) return { error: "Message too long." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data, error } = await supabase
    .from("messages")
    .insert({
      group_id: groupId,
      user_id: user.id,
      body: trimmed,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to send message:", error);
    return { error: "Couldn't send message." };
  }

  return { messageId: data.id };
}

/**
 * Toggle a reaction on a message. Adds it if missing, removes it if present.
 * RLS enforces that the user is a member of the message's group.
 */
export async function toggleReaction(
  messageId: string,
  emoji: string
): Promise<{ added?: boolean; error?: string }> {
  if (!emoji || emoji.length > 10) return { error: "Invalid emoji." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Check if this reaction already exists (same user, same message, same emoji).
  const { data: existing } = await supabase
    .from("reactions")
    .select("id")
    .eq("message_id", messageId)
    .eq("user_id", user.id)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("reactions").delete().eq("id", existing.id);
    if (error) {
      console.error("Failed to remove reaction:", error);
      return { error: "Couldn't remove reaction." };
    }
    return { added: false };
  }

  const { error } = await supabase
    .from("reactions")
    .insert({ message_id: messageId, user_id: user.id, emoji });
  if (error) {
    console.error("Failed to add reaction:", error);
    return { error: "Couldn't add reaction." };
  }
  return { added: true };
}
