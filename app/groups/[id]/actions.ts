"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCalendarEvent, getFreshAccessToken } from "@/lib/google/calendar";

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

/**
 * Threshold for confirming a catch-up: we want a real majority, but tiny groups
 * shouldn't need 3 people. So: at least min(3, member_count) "in" RSVPs.
 */
function confirmThreshold(memberCount: number): number {
  return Math.min(3, memberCount);
}

/**
 * Dismiss the current suggestion. Marks it expired and lets the next page load
 * generate a new one. Useful for "this time doesn't work, give me another"
 * and for re-running the demo.
 *
 * Members can dismiss any suggestion in their group.
 */
export async function dismissSuggestion(suggestionId: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createAdminClient();

  // Confirm caller is a member of the suggestion's group.
  const { data: suggestion } = await admin
    .from("catchup_suggestions")
    .select("id, group_id")
    .eq("id", suggestionId)
    .single();
  if (!suggestion) return { error: "Suggestion not found." };

  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", suggestion.group_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return { error: "Not a member of this group." };

  const { error } = await admin
    .from("catchup_suggestions")
    .update({ status: "expired" })
    .eq("id", suggestionId);
  if (error) {
    console.error("Failed to dismiss suggestion:", error);
    return { error: "Couldn't dismiss." };
  }

  return { ok: true };
}

/**
 * RSVP to a catch-up suggestion. Upserts the user's response.
 *
 * If this RSVP pushes the suggestion over the confirmation threshold, we:
 *   - flip status to 'confirmed'
 *   - send a Google Calendar invite to all "in" attendees
 *   - store the resulting google_event_id
 */
export async function rsvpToSuggestion(
  suggestionId: string,
  response: "in" | "out"
): Promise<{ confirmed?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Upsert the RSVP. Will fail if the user isn't a member of the group (RLS).
  const { error: upsertError } = await supabase
    .from("catchup_rsvps")
    .upsert(
      { suggestion_id: suggestionId, user_id: user.id, response, responded_at: new Date().toISOString() },
      { onConflict: "suggestion_id,user_id" }
    );
  if (upsertError) {
    console.error("Failed to RSVP:", upsertError);
    return { error: "Couldn't save RSVP." };
  }

  // Reload the suggestion + RSVPs to decide whether to confirm.
  const admin = createAdminClient();
  const { data: suggestion } = await admin
    .from("catchup_suggestions")
    .select("id, group_id, suggested_start, suggested_end, status, google_event_id")
    .eq("id", suggestionId)
    .single();
  if (!suggestion) return { error: "Suggestion not found." };
  if (suggestion.status !== "pending") return { confirmed: suggestion.status === "confirmed" };

  // Count "in" RSVPs and how many members the group has.
  const [{ data: rsvpRows }, { data: memberRows }] = await Promise.all([
    admin.from("catchup_rsvps").select("user_id, response").eq("suggestion_id", suggestionId),
    admin.from("group_members").select("user_id").eq("group_id", suggestion.group_id),
  ]);

  const inUserIds = (rsvpRows ?? []).filter((r) => r.response === "in").map((r) => r.user_id);
  const memberCount = (memberRows ?? []).length;

  if (inUserIds.length < confirmThreshold(memberCount)) {
    return { confirmed: false };
  }

  // Confirm: send invite from the suggestion creator (we'll just use the first
  // "in" user with a connected Google account). Get their tokens.
  let creatorAccessToken: string | null = null;
  for (const uid of inUserIds) {
    const t = await getFreshAccessToken(admin, uid);
    if (t) {
      creatorAccessToken = t.accessToken;
      break;
    }
  }
  if (!creatorAccessToken) {
    console.warn("No connected Google user to send invites from for suggestion", suggestionId);
    // Mark confirmed anyway so the UI updates; we just won't have a calendar event.
    await admin
      .from("catchup_suggestions")
      .update({ status: "confirmed" })
      .eq("id", suggestionId);
    return { confirmed: true };
  }

  // Look up emails for all "in" attendees.
  const { data: tokenRows } = await admin
    .from("user_google_tokens")
    .select("user_id, email")
    .in("user_id", inUserIds);
  const attendeeEmails = (tokenRows ?? [])
    .map((r) => r.email)
    .filter((e): e is string => !!e);

  // Look up the group name for the event title.
  const { data: groupRow } = await admin
    .from("groups")
    .select("name")
    .eq("id", suggestion.group_id)
    .single();
  const groupName = groupRow?.name ?? "Friends";

  try {
    const event = await createCalendarEvent(creatorAccessToken, {
      summary: `${groupName} catch-up`,
      description: "Suggested by Ambient.",
      startIso: new Date(suggestion.suggested_start).toISOString(),
      endIso: new Date(suggestion.suggested_end).toISOString(),
      attendees: attendeeEmails,
    });

    await admin
      .from("catchup_suggestions")
      .update({ status: "confirmed", google_event_id: event.id })
      .eq("id", suggestionId);
  } catch (err) {
    console.error("Calendar event create failed:", err);
    // Still confirm — we'll surface a "couldn't send invite" warning later.
    await admin
      .from("catchup_suggestions")
      .update({ status: "confirmed" })
      .eq("id", suggestionId);
  }

  return { confirmed: true };
}
