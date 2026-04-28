import type { SupabaseClient } from "@supabase/supabase-js";
import type { Track } from "@/lib/spotify/api";

/**
 * Same logic as saveListeningEvent (in save.ts) but parameterized on the
 * Supabase client. Used by the cron endpoint, which can't read user cookies
 * and must use the service-role admin client to write events on behalf of
 * each user.
 *
 * Returns one of: "saved" | "no-track" | "skipped"
 */
export async function saveListeningEventAdmin(
  supabase: SupabaseClient,
  userId: string,
  track: Track | null,
  isLive: boolean
): Promise<"saved" | "no-track" | "skipped"> {
  // Most recent event for this user.
  const { data: latest } = await supabase
    .from("listening_events")
    .select("id, spotify_track_id, is_currently_playing")
    .eq("user_id", userId)
    .order("played_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!track) {
    if (latest?.is_currently_playing) {
      await supabase
        .from("listening_events")
        .update({ is_currently_playing: false })
        .eq("id", latest.id);
      return "saved";
    }
    return "no-track";
  }

  const sameAsLatest = latest?.spotify_track_id === track.spotifyTrackId;
  const stateChanged = latest?.is_currently_playing !== isLive;

  if (sameAsLatest && !stateChanged) return "skipped";

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

  return "saved";
}
