/**
 * Spotify OAuth token refresh.
 *
 * Spotify access tokens expire after 1 hour. To get a new one we POST the
 * refresh_token to https://accounts.spotify.com/api/token, authenticated with
 * our app's client_id + client_secret as HTTP Basic auth.
 *
 * Spotify sometimes returns a NEW refresh_token in the response, sometimes
 * not. If it does, we should save it and use it next time.
 */

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

export type RefreshedTokens = {
  accessToken: string;
  /** May be undefined if Spotify didn't issue a new refresh token. */
  refreshToken?: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
};

export async function refreshSpotifyToken(refreshToken: string): Promise<RefreshedTokens> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing Spotify env vars (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET)");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify token refresh failed (${res.status}): ${body}`);
  }

  const data = await res.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token, // may be undefined
    expiresIn: data.expires_in,
  };
}
