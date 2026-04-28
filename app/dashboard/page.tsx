import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentlyPlaying, getLastPlayed, type Track } from "@/lib/spotify/api";
import { saveListeningEvent } from "@/lib/listening/save";
import SignOutButton from "./sign-out-button";
import AutoRefresh from "./auto-refresh";
import DisconnectGoogleButton from "./disconnect-google-button";

/**
 * Dashboard. Server Component.
 *
 * Shows the signed-in user, their currently-playing track, and the groups
 * they belong to.
 */
export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Spotify token + currently-playing
  const { data: { session } } = await supabase.auth.getSession();
  const spotifyToken = session?.provider_token ?? null;

  let track: Track | null = null;
  let isLive = false;
  let fetchError: string | null = null;

  if (spotifyToken) {
    try {
      track = await getCurrentlyPlaying(spotifyToken);
      isLive = !!track;
      if (!track) {
        track = await getLastPlayed(spotifyToken);
      }
      // Persist to listening_events so group members can see this track.
      // Best-effort — if it fails, the dashboard still renders.
      saveListeningEvent(user.id, track, isLive).catch((err) =>
        console.error("Failed to save listening event:", err)
      );
    } catch (err) {
      fetchError = err instanceof Error ? err.message : "Unknown Spotify error";
    }
  }

  // Groups the user belongs to (RLS makes sure this only returns their groups).
  const { data: groups } = await supabase
    .from("groups")
    .select("id, name, emoji, cadence_days, created_at")
    .order("created_at", { ascending: false });

  // Whether the user has connected Google Calendar (admin client, since RLS
  // blocks user reads on user_google_tokens).
  const admin = createAdminClient();
  const { data: googleRow } = await admin
    .from("user_google_tokens")
    .select("email")
    .eq("user_id", user.id)
    .maybeSingle();
  const googleEmail: string | null = googleRow?.email ?? null;


  const displayName = user.user_metadata?.full_name ?? user.email ?? "there";
  const avatarUrl = user.user_metadata?.avatar_url;

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
      {/* Re-renders this Server Component every 30s so we re-fetch Spotify
          and re-save the listening event. Renders nothing visible. */}
      <AutoRefresh intervalMs={30_000} />
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Ambient
          </h1>
          <SignOutButton />
        </header>

        {/* Profile card */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-4">
            {avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-12 h-12 rounded-full"
              />
            )}
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Signed in as</p>
              <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
                {displayName}
              </p>
            </div>
          </div>
        </div>

        {/* Now playing card */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 mb-4">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isLive ? "bg-green-500 animate-pulse" : "bg-zinc-400"
              }`}
            />
            <span className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {isLive ? "Now playing" : track ? "Last played" : "Not playing"}
            </span>
          </div>

          {fetchError ? (
            <div className="text-sm text-red-600 dark:text-red-400">
              Couldn&apos;t reach Spotify: {fetchError}
            </div>
          ) : track ? (
            <a
              href={track.trackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 group"
            >
              {track.albumArtUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={track.albumArtUrl}
                  alt={track.album}
                  className="w-20 h-20 rounded-lg shadow-md"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50 group-hover:underline truncate">
                  {track.name}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 truncate">
                  {track.artist}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 truncate mt-1">
                  {track.album}
                </p>
              </div>
            </a>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Nothing playing right now. Hit play on Spotify and refresh this page.
            </p>
          )}
        </div>

        {/* Google (Calendar + Photos) */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xl">
                📅
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  Google Calendar
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {googleEmail
                    ? `Connected as ${googleEmail}`
                    : "Connect to enable catch-up suggestions"}
                </p>
              </div>
            </div>
            {!googleEmail && (
              <a
                href="/api/google/start"
                className="text-sm font-medium px-4 py-2 rounded-full bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                Connect
              </a>
            )}
          </div>

          {googleEmail && (
            <div className="pt-2">
              <DisconnectGoogleButton />
            </div>
          )}
        </div>

        {/* Your groups */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Your groups
            </h2>
            <Link
              href="/groups/new"
              className="text-sm font-medium text-green-600 dark:text-green-400 hover:underline"
            >
              + New group
            </Link>
          </div>

          {groups && groups.length > 0 ? (
            <ul className="space-y-2">
              {groups.map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/groups/${g.id}`}
                    className="flex items-center gap-3 p-3 -mx-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xl">
                      {g.emoji ?? "👥"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-zinc-900 dark:text-zinc-50 truncate">
                        {g.name}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Catching up every {g.cadence_days} days
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              You&apos;re not in any groups yet. Create one to get started.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
