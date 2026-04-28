import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * OAuth callback route — Supabase redirects here after Spotify auth completes.
 *
 * Lives at /auth/callback. Receives a `code` query param, exchanges it for a
 * session, captures the Spotify tokens for our cron, and forwards the user.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      // Capture Spotify tokens for the cron job. The session has provider_token
      // (Spotify access token) and provider_refresh_token. We save both, plus a
      // best-guess expiry of 1 hour from now (Spotify default).
      const session = data.session;
      const userId = session.user.id;
      const accessToken = session.provider_token;
      const refreshToken = session.provider_refresh_token;

      if (accessToken && refreshToken) {
        const admin = createAdminClient();
        const expiresAt = new Date(Date.now() + 55 * 60 * 1000); // 55 min, slightly under Spotify's 60.

        const { error: upsertError } = await admin
          .from("user_spotify_tokens")
          .upsert(
            {
              user_id: userId,
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_at: expiresAt.toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );

        if (upsertError) {
          console.error("Failed to save Spotify tokens:", upsertError);
        }
      } else {
        console.warn("Sign-in succeeded but no Spotify tokens in session.");
      }

      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error("Auth callback error:", error?.message);
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}
