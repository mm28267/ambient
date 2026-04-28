"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

type Props = {
  /** Optional path to redirect to after successful sign-in (e.g. an invite URL). */
  next?: string;
};

/**
 * The "Sign in with Spotify" button.
 *
 * Client Component because we need an onClick handler. The actual OAuth flow
 * is initiated by Supabase, which redirects to Spotify's auth page.
 */
export default function SignInButton({ next }: Props) {
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    const supabase = createClient();

    const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
    if (next) callbackUrl.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "spotify",
      options: {
        redirectTo: callbackUrl.toString(),
        scopes: "user-read-currently-playing user-read-recently-played user-top-read",
      },
    });

    if (error) {
      console.error("Sign in failed:", error.message);
      setLoading(false);
    }
    // On success, the browser is redirected to Spotify and won't return here.
  };

  return (
    <button
      onClick={handleSignIn}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 h-12 px-6 rounded-full bg-[#1DB954] hover:bg-[#1ed760] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
    >
      {/* Spotify logo */}
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-5 h-5"
        aria-hidden="true"
      >
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.6-1.559.3z"/>
      </svg>
      {loading ? "Connecting..." : "Sign in with Spotify"}
    </button>
  );
}
