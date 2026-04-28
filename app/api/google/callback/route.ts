import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { exchangeCode, fetchGoogleUserInfo } from "@/lib/google/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * OAuth callback for Google. Receives ?code=...&state=... from Google,
 * verifies state, exchanges code for tokens, and saves them.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const dashUrl = new URL("/dashboard", request.url);

  // User clicked "Cancel" on Google's consent screen.
  if (error) {
    dashUrl.searchParams.set("google", "denied");
    return NextResponse.redirect(dashUrl);
  }

  if (!code || !state) {
    dashUrl.searchParams.set("google", "invalid");
    return NextResponse.redirect(dashUrl);
  }

  // Verify state matches the cookie we set in /api/google/start.
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("google_oauth_state")?.value;
  if (!expectedState || state !== expectedState) {
    dashUrl.searchParams.set("google", "state_mismatch");
    return NextResponse.redirect(dashUrl);
  }

  // Make sure user is still signed in.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Same redirect URI as in /start — must match exactly.
  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const redirectUri = `${proto}://${host}/api/google/callback`;

  // Exchange code for tokens.
  let tokens;
  try {
    tokens = await exchangeCode(code, redirectUri);
  } catch (err) {
    console.error("Google code exchange failed:", err);
    dashUrl.searchParams.set("google", "exchange_failed");
    return NextResponse.redirect(dashUrl);
  }

  if (!tokens.refresh_token) {
    // Without a refresh token, the cron can't poll later. Tell user to retry.
    console.warn("Google did not return a refresh_token. User may have already authorized.");
    dashUrl.searchParams.set("google", "no_refresh");
    return NextResponse.redirect(dashUrl);
  }

  // Get email for display.
  const userInfo = await fetchGoogleUserInfo(tokens.access_token);

  // Save via admin client (bypasses RLS).
  const admin = createAdminClient();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  const { error: upsertError } = await admin
    .from("user_google_tokens")
    .upsert(
      {
        user_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt.toISOString(),
        scope: tokens.scope,
        email: userInfo.email ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (upsertError) {
    console.error("Failed to save Google tokens:", upsertError);
    dashUrl.searchParams.set("google", "save_failed");
    return NextResponse.redirect(dashUrl);
  }

  dashUrl.searchParams.set("google", "connected");
  const response = NextResponse.redirect(dashUrl);
  // Clean up the state cookie.
  response.cookies.delete("google_oauth_state");
  return response;
}
