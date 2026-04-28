import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchGroupFreeBusy } from "@/lib/google/calendar";
import { findCommonFree, filterToReasonableHours, scoreWindow } from "@/lib/calendar/availability";
import GroupTiles, { type Member, type ListeningEvent } from "./group-tiles";
import GroupChat, { type ChatMessage, type Reaction } from "./group-chat";
import CatchupCard, { type Suggestion, type RSVP } from "./catchup-card";
import GroupPhotos, { type GroupPhoto } from "./group-photos";
import GroupVibes, { type MemberVibe } from "./group-vibes";

// Force the page to be re-rendered on every request so router.refresh()
// always picks up new database state.
export const dynamic = "force-dynamic";

/**
 * /groups/[id] — the group page.
 *
 * Server Component shell that fetches initial data, then hands off to the
 * Client Component (GroupTiles) for the live-updating tile grid.
 */
export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // 1. Group metadata. RLS prevents non-members from reading this row.
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, emoji, cadence_days")
    .eq("id", id)
    .single();
  if (!group) notFound();

  // 2. Members of this group (just IDs and roles).
  const { data: memberRows } = await supabase
    .from("group_members")
    .select("user_id, role, joined_at")
    .eq("group_id", id)
    .order("joined_at", { ascending: true });

  // 3. Fetch profiles for those member ids (including vibe fields).
  const memberUserIds = (memberRows ?? []).map((m) => m.user_id);
  const { data: profileRows } = memberUserIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, timezone, last_seen_at, weather_temp_f, weather_code, calendar_status_text")
        .in("id", memberUserIds)
    : { data: [] as const };

  type ProfileRow = {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    timezone: string | null;
    last_seen_at: string | null;
    weather_temp_f: number | null;
    weather_code: number | null;
    calendar_status_text: string | null;
  };
  const profileById = new Map(
    (profileRows ?? []).map((p) => [p.id, p as ProfileRow])
  );

  const members: Member[] = (memberRows ?? []).map((m) => {
    const p = profileById.get(m.user_id);
    return {
      user_id: m.user_id,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
    };
  });

  const vibes: MemberVibe[] = (memberRows ?? []).map((m) => {
    const p = profileById.get(m.user_id);
    return {
      user_id: m.user_id,
      timezone: p?.timezone ?? null,
      last_seen_at: p?.last_seen_at ?? null,
      weather_temp_f: p?.weather_temp_f ?? null,
      weather_code: p?.weather_code ?? null,
      calendar_status_text: p?.calendar_status_text ?? null,
    };
  });

  // 4. Recent listening events for these members. RLS already restricts.
  const { data: events } = memberUserIds.length
    ? await supabase
        .from("listening_events")
        .select("id, user_id, track_name, artist, album, album_art_url, track_url, is_currently_playing, played_at")
        .in("user_id", memberUserIds)
        .order("played_at", { ascending: false })
        .limit(50)
    : { data: [] as const };

  const initialEvents = (events ?? []) as ListeningEvent[];

  // 5. Recent chat messages for the group (oldest first for chronological display).
  const { data: messageRows } = await supabase
    .from("messages")
    .select("id, group_id, user_id, body, created_at")
    .eq("group_id", id)
    .order("created_at", { ascending: true })
    .limit(100);
  const initialMessages = (messageRows ?? []) as ChatMessage[];

  // 5b. Reactions for those messages.
  const messageIdList = initialMessages.map((m) => m.id);
  const { data: reactionRows } = messageIdList.length
    ? await supabase
        .from("reactions")
        .select("id, message_id, user_id, emoji, created_at")
        .in("message_id", messageIdList)
    : { data: [] as const };
  const initialReactions = (reactionRows ?? []) as Reaction[];

  // 5c. Recent photos for the group.
  const { data: photoRows } = await supabase
    .from("photo_events")
    .select("id, user_id, group_id, storage_path, caption, mime_type, width, height, created_at")
    .eq("group_id", id)
    .order("created_at", { ascending: false })
    .limit(60);
  const initialPhotos = (photoRows ?? []) as GroupPhoto[];

  // Public URL prefix for the bucket.
  const photoUrlBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/group-photos`;

  // 6. Find or create an active catch-up suggestion for this group.
  let activeSuggestion: Suggestion | null = null;
  let activeRsvps: RSVP[] = [];
  let connectedCount = 0;

  try {
    const admin = createAdminClient();

    // a) Is there a confirmed or pending suggestion that hasn't expired?
    const { data: existing } = await admin
      .from("catchup_suggestions")
      .select("id, group_id, suggested_start, suggested_end, status, google_event_id")
      .eq("group_id", id)
      .in("status", ["pending", "confirmed"])
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      activeSuggestion = existing as Suggestion;
    } else {
      // b) No active suggestion — compute a new one from Google free/busy.
      const freeBusy = await fetchGroupFreeBusy(admin, memberUserIds, 14);
      connectedCount = freeBusy.filter((u) => !u.error).length;

      if (connectedCount >= 1) {
        const now = new Date();
        const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        const common = findCommonFree(freeBusy, now, horizon);
        const reasonable = filterToReasonableHours(common);
        const ranked = reasonable
          .map((w) => ({ w, score: scoreWindow(w) }))
          .sort((a, b) => b.score - a.score);

        // Cycle through the ranked list as the user dismisses. Count past
        // dismissals (expired/declined) for this group within the last 14 days
        // and use that as an index into the ranked list. After the list is
        // exhausted we wrap around — but each dismiss reliably advances.
        const lookback = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const { count: dismissedCount } = await admin
          .from("catchup_suggestions")
          .select("id", { count: "exact", head: true })
          .eq("group_id", id)
          .in("status", ["expired", "declined"])
          .gt("created_at", lookback);

        const idx = ranked.length > 0 ? (dismissedCount ?? 0) % ranked.length : 0;
        const chosen = ranked[idx];

        if (chosen) {
          const { data: created } = await admin
            .from("catchup_suggestions")
            .insert({
              group_id: id,
              suggested_start: chosen.w.start.toISOString(),
              suggested_end: chosen.w.end.toISOString(),
              status: "pending",
            })
            .select("id, group_id, suggested_start, suggested_end, status, google_event_id")
            .single();
          if (created) activeSuggestion = created as Suggestion;
        }
      }
    }

    // c) Load RSVPs for this suggestion.
    if (activeSuggestion) {
      const { data: rsvpRows } = await admin
        .from("catchup_rsvps")
        .select("suggestion_id, user_id, response")
        .eq("suggestion_id", activeSuggestion.id);
      activeRsvps = (rsvpRows ?? []) as RSVP[];
    }
  } catch (err) {
    console.error("Failed to load/create suggestion:", err);
  }

  // 7. Latest invite code (for the share link).
  const { data: invite } = await supabase
    .from("group_invites")
    .select("invite_code")
    .eq("group_id", id)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Build the invite URL from request headers so it works in dev and prod
  // without hardcoding a host.
  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const inviteUrl = invite ? `${protocol}://${host}/join/${invite.invite_code}` : null;

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← Back
        </Link>

        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-3xl">
            {group.emoji ?? "👥"}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {group.name}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {members.length} {members.length === 1 ? "member" : "members"} · Catching up every {group.cadence_days} days
            </p>
          </div>
        </div>

        <GroupVibes members={members} vibes={vibes} />

        <GroupTiles
          groupId={group.id}
          members={members}
          initialEvents={initialEvents}
        />

        {/* Catch-up suggestion */}
        {activeSuggestion ? (
          <CatchupCard
            // Re-mount the card whenever the underlying suggestion changes,
            // so React doesn't keep the previous suggestion's state.
            key={activeSuggestion.id}
            groupId={group.id}
            members={members}
            suggestion={activeSuggestion}
            initialRsvps={activeRsvps}
            currentUserId={user.id}
          />
        ) : (
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 text-center">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
              {connectedCount === 0
                ? "Connect Google Calendar to see catch-up suggestions"
                : "No common free time found in the next 14 days."}
            </p>
            {connectedCount === 0 && (
              <Link
                href="/dashboard"
                className="text-sm font-medium text-green-600 dark:text-green-400 hover:underline"
              >
                Go to dashboard →
              </Link>
            )}
          </div>
        )}

        <GroupPhotos
          groupId={group.id}
          members={members}
          initialPhotos={initialPhotos}
          currentUserId={user.id}
          publicUrlBase={photoUrlBase}
        />

        <GroupChat
          groupId={group.id}
          members={members}
          initialMessages={initialMessages}
          initialReactions={initialReactions}
          currentUserId={user.id}
        />

        {inviteUrl && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 space-y-2">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Invite friends
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Send them this link. Expires in 7 days.
            </p>
            <div className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 rounded-lg p-3 mt-2 break-all select-all">
              {inviteUrl}
            </div>
          </div>
        )}

        <p className="text-xs text-center text-zinc-400 dark:text-zinc-600">
          Tiles update in real time when group members change tracks.
        </p>
      </div>
    </main>
  );
}
