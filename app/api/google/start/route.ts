import { NextResponse } from "next/server";
import { headers } from "next/headers";
import crypto from "crypto";
import { buildAuthUrl } from "@/lib/google/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Initiates Google OAuth. The user lands here from a "Connect Google Calendar"
 * button. We:
 *   1. Verify they're signed in (otherwise can't link an account to anyone).
 *   2. Generate a random state token and stash it in an httpOnly cookie.
 *   3. Redirect to Google's authorization URL.
 *
 * On approval, Google redirects them to /api/google/callback with a code.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Build the redirect URI from the incoming request's host so dev + prod
  // both work without hardcoding.
  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const redirectUri = `${proto}://${host}/api/google/callback`;

  // CSRF protection: random state, verified on callback.
  const state = crypto.randomBytes(16).toString("hex");

  const response = NextResponse.redirect(buildAuthUrl(state, redirectUri));
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: proto === "https",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });
  return response;
}
