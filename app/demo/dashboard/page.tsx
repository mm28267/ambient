"use client";

/**
 * /demo/dashboard — fully simulated dashboard for the presentation demo.
 *
 * No auth, no Supabase, no Spotify API. Static content with one clickable
 * link to /demo/group.
 */

import Link from "next/link";

const ME = {
  display_name: "Maral M.",
  email: "mm6620@gsb.columbia.edu",
  avatar_url: "/demo-photos/Maral.jpg",
};

const TRACK = {
  name: "Guillotine",
  artist: "Mansionair, NoMBe",
  album: "Happiness, Guaranteed",
};

const GROUPS = [
  { id: "demo-group", name: "London Friends", emoji: "🌊", cadence_days: 14 },
];

export default function DemoDashboardPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Ambient</h1>
          <Link
            href="/demo"
            className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >
            Sign out
          </Link>
        </header>

        {/* Profile card */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ME.avatar_url} alt={ME.display_name} className="w-12 h-12 rounded-full" />
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Signed in as</p>
              <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{ME.display_name}</p>
            </div>
          </div>
        </div>

        {/* Now playing card */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Now playing</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-800 flex items-center justify-center text-3xl shadow-md">
              🎵
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50 truncate">{TRACK.name}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 truncate">{TRACK.artist}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-500 truncate mt-1">{TRACK.album}</p>
            </div>
          </div>
        </div>

        {/* Google card */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xl">
                📅
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Google Calendar</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">Connected as {ME.email}</p>
              </div>
            </div>
          </div>
          <div className="pt-2">
            <button
              type="button"
              className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 hover:underline"
            >
              Disconnect Google
            </button>
          </div>
        </div>

        {/* Your groups */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Your groups</h2>
            <span className="text-sm font-medium text-green-600 dark:text-green-400">+ New group</span>
          </div>

          <ul className="space-y-2">
            {GROUPS.map((g) => (
              <li key={g.id}>
                <Link
                  href="/demo/group"
                  className="flex items-center gap-3 p-3 -mx-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xl">
                    {g.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50 truncate">{g.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Catching up every {g.cadence_days} days
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
