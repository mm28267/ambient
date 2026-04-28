import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshGoogleToken } from "./auth";

export type CreatedEvent = {
  id: string;
  htmlLink: string;
};

/**
 * Google Calendar API helpers.
 *
 * The cron-friendly entry point is fetchGroupFreeBusy: give it a list of
 * user_ids and it returns each user's busy windows in the next N days,
 * refreshing access tokens on demand.
 */

export type BusyWindow = { start: string; end: string };

export type UserBusy = {
  user_id: string;
  email: string | null;
  busy: BusyWindow[];
  /** True if we couldn't read this user's calendar (no tokens, refresh failed, etc.) */
  error?: string;
};

/**
 * Create a calendar event on the given user's primary calendar.
 * Sends invites to all attendees.
 *
 * `attendees` are email addresses; the creator's email is auto-added by Google.
 */
export async function createCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    startIso: string;
    endIso: string;
    attendees: string[];
  }
): Promise<CreatedEvent> {
  const url = "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startIso },
      end: { dateTime: event.endIso },
      attendees: event.attendees.map((e) => ({ email: e })),
      reminders: { useDefault: true },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google calendar event create failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return { id: data.id, htmlLink: data.htmlLink };
}

/**
 * Get a fresh access token for the given user, refreshing if expired.
 * Persists the new token back to user_google_tokens.
 *
 * Requires the admin Supabase client because user_google_tokens is service-role only.
 */
export async function getFreshAccessToken(
  admin: SupabaseClient,
  userId: string
): Promise<{ accessToken: string; email: string | null } | null> {
  const { data: row } = await admin
    .from("user_google_tokens")
    .select("access_token, refresh_token, expires_at, email")
    .eq("user_id", userId)
    .maybeSingle();

  if (!row) return null;

  const expiresAt = new Date(row.expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) {
    return { accessToken: row.access_token, email: row.email ?? null };
  }

  // Refresh
  try {
    const refreshed = await refreshGoogleToken(row.refresh_token);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    await admin
      .from("user_google_tokens")
      .update({
        access_token: refreshed.access_token,
        // Google sometimes rotates refresh_token; prefer new if returned.
        refresh_token: refreshed.refresh_token ?? row.refresh_token,
        expires_at: newExpiresAt.toISOString(),
        scope: refreshed.scope ?? row.scope ?? "",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    return { accessToken: refreshed.access_token, email: row.email ?? null };
  } catch (err) {
    console.error(`[google] failed to refresh token for ${userId}:`, err);
    return null;
  }
}

/**
 * Call Google's freeBusy endpoint for a single user.
 */
async function fetchFreeBusy(
  accessToken: string,
  email: string,
  timeMinIso: string,
  timeMaxIso: string
): Promise<BusyWindow[]> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      items: [{ id: email }],
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google freeBusy failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const busy: BusyWindow[] = data.calendars?.[email]?.busy ?? [];
  return busy;
}

/**
 * Read free/busy windows for a list of users for the given window.
 * Default lookahead: 14 days.
 *
 * Returns one entry per requested user, even if their token failed —
 * in that case `error` is set and `busy` is empty.
 */
export async function fetchGroupFreeBusy(
  admin: SupabaseClient,
  userIds: string[],
  daysAhead = 14
): Promise<UserBusy[]> {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

  const results: UserBusy[] = [];
  for (const uid of userIds) {
    const tokenInfo = await getFreshAccessToken(admin, uid);
    if (!tokenInfo) {
      results.push({ user_id: uid, email: null, busy: [], error: "no_token" });
      continue;
    }
    if (!tokenInfo.email) {
      results.push({ user_id: uid, email: null, busy: [], error: "no_email" });
      continue;
    }
    try {
      const busy = await fetchFreeBusy(tokenInfo.accessToken, tokenInfo.email, timeMin, timeMax);
      results.push({ user_id: uid, email: tokenInfo.email, busy });
    } catch (err) {
      results.push({
        user_id: uid,
        email: tokenInfo.email,
        busy: [],
        error: err instanceof Error ? err.message : "fetch_failed",
      });
    }
  }
  return results;
}
