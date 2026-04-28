"use client";

import { useEffect, useState } from "react";
import { weatherCodeToEmoji } from "@/lib/weather/openmeteo";
import type { Member } from "./group-tiles";

export type MemberVibe = {
  user_id: string;
  timezone: string | null;
  last_seen_at: string | null;
  weather_temp_f: number | null;
  weather_code: number | null;
  calendar_status_text: string | null;
};

type Props = {
  members: Member[];
  vibes: MemberVibe[];
};

/**
 * "Vibes" panel — across-the-street view of each member's current state.
 * Round 1: local time + last-active.
 * Future rounds: weather, calendar status.
 *
 * Re-renders the time labels every 60s so they stay current without a refresh.
 */
export default function GroupVibes({ members, vibes }: Props) {
  // Force re-render each minute so "active 4m ago" stays accurate.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const vibesById = new Map(vibes.map((v) => [v.user_id, v]));

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Vibes
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          What everyone&apos;s up to right now.
        </p>
      </div>

      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {members.map((m) => {
          const vibe = vibesById.get(m.user_id);
          const tz = vibe?.timezone || null;
          const localTime = tz ? formatLocalTime(tz) : null;
          const lastSeen = vibe?.last_seen_at ? formatLastSeen(vibe.last_seen_at) : null;
          const isActive = vibe?.last_seen_at
            ? Date.now() - new Date(vibe.last_seen_at).getTime() < 5 * 60 * 1000
            : false;

          return (
            <li key={m.user_id} className="flex items-center gap-3 px-5 py-3">
              {m.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.avatar_url}
                  alt={m.display_name ?? "Member"}
                  className="w-9 h-9 rounded-full flex-shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-700 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
                    {m.display_name ?? "Anonymous"}
                  </p>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 text-xs flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-green-700 dark:text-green-400">Here now</span>
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                      {lastSeen ?? "not seen yet"}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {localTime && <span>🕓 {localTime}</span>}
                  {vibe?.weather_temp_f != null && (
                    <span title={weatherCodeToEmoji(vibe.weather_code).label}>
                      {weatherCodeToEmoji(vibe.weather_code).emoji} {Math.round(vibe.weather_temp_f)}°
                    </span>
                  )}
                  {vibe?.calendar_status_text && (
                    <span className="text-zinc-600 dark:text-zinc-300">
                      📅 {vibe.calendar_status_text}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatLocalTime(timezone: string): string {
  try {
    return new Intl.DateTimeFormat([], {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date());
  } catch {
    return "—";
  }
}

function formatLastSeen(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `active ${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `active ${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `active ${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
