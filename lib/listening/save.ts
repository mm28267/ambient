import { createClient } from "@/lib/supabase/server";
import type { Track } from "@/lib/spotify/api";

/**
 * Persists a track to listening_events so other group members can see it.
 *
 * Logic:
 *   - If the user has an existing event with the same spotify_track_id flagged
 *     as currently_playing, we leave it alone (don't insert duplicates per refresh).
 *   - If they were playing something different, mark the old row's
 *     is_currently_playing=false and insert a new row.
 *   - If nothing was playing previously and now something is, insert.
 *
 * For week 2 we keep this simple. In week 3 we'll move it to a cron that polls
 * every 30s instead of relying on dashboard renders.
 */
export async function saveListeningEvent(
  userId: string,
  track: Track | null,
  isLive: boolean
): Promise<void> {
  const supabase = await createClient();

  // Fetch the user's most recent event to compare.
  const { data: latest } = await supabase
    .from("listening_events")
    .select("id, spotify_track_id, is_currently_playing")
    .eq("user_id", userId)
    .order("played_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Nothing to save if we have no track and the latest is already not-playing.
  if (!track) {
    if (latest?.is_currently_playing) {
      await supabase
        .from("listening_events")
        .update({ is_currently_playing: false })
        .eq("id", latest.id);
    }
    return;
  }

  const sameAsLatest = latest?.spotify_track_id === track.spotifyTrackId;
  const stateChanged = latest?.is_currently_playing !== isLive;

  // Same track, same playing state — no-op.
  if (sameAsLatest && !stateChanged) return;

  // Different track or state changed — flip latest off (if needed) + insert new row.
  if (latest?.is_currently_playing && !sameAsLatest) {
    await supabase
      .from("listening_events")
      .update({ is_currently_playing: false })
      .eq("id", latest.id);
  }

  await supabase.from("listening_events").insert({
    user_id: userId,
    track_name: track.name,
    artist: track.artist,
    album: track.album,
    album_art_url: track.albumArtUrl,
    spotify_track_id: track.spotifyTrackId,
    track_url: track.trackUrl,
    is_currently_playing: isLive,
  });
}
