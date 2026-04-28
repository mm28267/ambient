import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshSpotifyToken } from "@/lib/spotify/auth";
import { getCurrentlyPlaying, getLastPlayed } from "@/lib/spotify/api";
import { saveListeningEventAdmin } from "@/lib/listening/save-admin";

/**
 * Cron endpoint: polls every connected user's Spotify and saves a
 * listening_event for each one, refreshing access tokens as needed.
 *
 * Protected by CRON_SECRET. Vercel Cron sends the configured value in the
 * `Authorization` header as `Bearer <secret>`. Without it, we 401.
 *
 * Vercel runs cron at intervals you configure in vercel.json. For local
 * testing you can hit this URL directly with the right header (see README).
 */
export async function GET(request: Request) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>.
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Fetch every user with stored Spotify tokens.
  const { data: tokenRows, error: tokenError } = await admin
    .from("user_spotify_tokens")
    .select("user_id, access_token, refresh_token, expires_at");

  if (tokenError) {
    console.error("[cron] failed to fetch token rows:", tokenError);
    return NextResponse.json({ error: tokenError.message }, { status: 500 });
  }

  const summary: {
    userId: string;
    status: "saved" | "no-track" | "skipped" | "error";
    detail?: string;
  }[] = [];

  for (const row of tokenRows ?? []) {
    try {
      let accessToken = row.access_token;

      // Refresh the access token if it's within 60s of expiry.
      const expiresAt = new Date(row.expires_at).getTime();
      if (expiresAt - Date.now() < 60_000) {
        const refreshed = await refreshSpotifyToken(row.refresh_token);
        accessToken = refreshed.accessToken;
        const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);

        await admin
          .from("user_spotify_tokens")
          .update({
            access_token: refreshed.accessToken,
            refresh_token: refreshed.refreshToken ?? row.refresh_token,
            expires_at: newExpiresAt.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", row.user_id);
      }

      // Fetch currently-playing; fall back to last-played if nothing.
      let track = await getCurrentlyPlaying(accessToken);
      let isLive = !!track;
      if (!track) {
        track = await getLastPlayed(accessToken);
        isLive = false;
      }

      // Persist if appropriate.
      const result = await saveListeningEventAdmin(admin, row.user_id, track, isLive);
      summary.push({ userId: row.user_id, status: result });
    } catch (err) {
      console.error(`[cron] error for user ${row.user_id}:`, err);
      summary.push({
        userId: row.user_id,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    userCount: tokenRows?.length ?? 0,
    summary,
  });
}
