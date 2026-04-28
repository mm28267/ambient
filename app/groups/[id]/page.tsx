import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import GroupTiles, { type Member, type ListeningEvent } from "./group-tiles";

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

  // 3. Fetch profiles for those member ids.
  const memberUserIds = (memberRows ?? []).map((m) => m.user_id);
  const { data: profileRows } = memberUserIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", memberUserIds)
    : { data: [] as const };

  const profileById = new Map(
    (profileRows ?? []).map((p) => [p.id, p as { id: string; display_name: string | null; avatar_url: string | null }])
  );

  const members: Member[] = (memberRows ?? []).map((m) => {
    const p = profileById.get(m.user_id);
    return {
      user_id: m.user_id,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
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

  // 5. Latest invite code (for the share link).
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

        <GroupTiles
          groupId={group.id}
          members={members}
          initialEvents={initialEvents}
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
