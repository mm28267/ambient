"use client";

/**
 * /demo — demo sign-in page.
 *
 * Looks like the real sign-in page but the button bypasses Spotify and
 * routes to /demo/dashboard. No auth, no OAuth, no API calls.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DemoLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSignIn = () => {
    setLoading(true);
    // Brief delay so the "Connecting..." state is visible — feels more real.
    setTimeout(() => router.push("/demo/dashboard"), 700);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-black p-8">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-3">
          <h1 className="text-5xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Ambient
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">A quiet way to stay close.</p>
        </div>

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 h-12 px-6 rounded-full bg-[#1DB954] hover:bg-[#1ed760] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
        >
          {/* Spotify logo */}
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.6-1.559.3z" />
          </svg>
          {loading ? "Connecting..." : "Sign in with Spotify"}
        </button>

        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          We&apos;ll only read your currently-playing track and recent listens.
        </p>
      </div>
    </main>
  );
}
