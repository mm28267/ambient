/**
 * Spotify Web API helpers.
 *
 * These all take an access token as the first argument so they're easy to test
 * and don't reach into Supabase on their own. The server pages/routes that call
 * them are responsible for grabbing the token.
 *
 * Spotify access tokens expire after 1 hour. For now we just use whatever
 * Supabase hands us. In week 2 we'll add a refresh helper.
 */

const SPOTIFY_API = "https://api.spotify.com/v1";

export type Track = {
  isPlaying: boolean;
  name: string;
  artist: string;
  album: string;
  albumArtUrl: string | null;
  trackUrl: string;
  spotifyTrackId: string;
};

/**
 * Fetch the user's currently-playing track.
 * Returns null when nothing is playing (Spotify returns 204 No Content).
 */
export async function getCurrentlyPlaying(accessToken: string): Promise<Track | null> {
  const res = await fetch(`${SPOTIFY_API}/me/player/currently-playing`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // Don't cache — we want fresh data every render.
    cache: "no-store",
  });

  // 204 = no track currently playing
  if (res.status === 204) return null;

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify API error (${res.status}): ${body}`);
  }

  const data = await res.json();
  if (!data.item) return null;

  return {
    isPlaying: data.is_playing,
    name: data.item.name,
    artist: data.item.artists.map((a: { name: string }) => a.name).join(", "),
    album: data.item.album.name,
    albumArtUrl: data.item.album.images?.[0]?.url ?? null,
    trackUrl: data.item.external_urls.spotify,
    spotifyTrackId: data.item.id,
  };
}

/**
 * Fetch the user's most recently played track.
 * Useful for the "idle state" — what they were listening to when they're not currently playing.
 */
export async function getLastPlayed(accessToken: string): Promise<Track | null> {
  const res = await fetch(`${SPOTIFY_API}/me/player/recently-played?limit=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify API error (${res.status}): ${body}`);
  }

  const data = await res.json();
  const item = data.items?.[0]?.track;
  if (!item) return null;

  return {
    isPlaying: false,
    name: item.name,
    artist: item.artists.map((a: { name: string }) => a.name).join(", "),
    album: item.album.name,
    albumArtUrl: item.album.images?.[0]?.url ?? null,
    trackUrl: item.external_urls.spotify,
    spotifyTrackId: item.id,
  };
}
