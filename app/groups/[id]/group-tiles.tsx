"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Member = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type ListeningEvent = {
  id: string;
  user_id: string;
  track_name: string;
  artist: string;
  album: string | null;
  album_art_url: string | null;
  track_url: string | null;
  is_currently_playing: boolean;
  played_at: string;
};

type Props = {
  groupId: string;
  members: Member[];
  initialEvents: ListeningEvent[];
};

/**
 * Client Component that renders member tiles and keeps them up-to-date via
 * Supabase Realtime.
 *
 * Initial data comes from the server (fast first paint). After mount, we
 * subscribe to listening_events INSERTs and UPDATEs for our group's members
 * and patch the local state when changes arrive. RLS still applies on the
 * server side — Realtime never broadcasts a row a user couldn't already SELECT.
 */
export default function GroupTiles({ groupId, members, initialEvents }: Props) {
  const [latestByUser, setLatestByUser] = useState<Map<string, ListeningEvent>>(
    () => {
      const map = new Map<string, ListeningEvent>();
      for (const ev of initialEvents) {
        if (!map.has(ev.user_id)) map.set(ev.user_id, ev);
      }
      return map;
    }
  );

  useEffect(() => {
    const supabase = createClient();
    const memberIds = members.map((m) => m.user_id);
    if (memberIds.length === 0) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let isCancelled = false;

    // Wait for the session, then explicitly authenticate the Realtime client.
    // Without this, Realtime can connect anonymously before the session hydrates,
    // and RLS blocks all events from being delivered to the subscriber.
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (isCancelled) return;
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase
        .channel(`group-${groupId}-events`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "listening_events",
            filter: `user_id=in.(${memberIds.join(",")})`,
          },
          (payload) => {
            const ev = payload.new as ListeningEvent;
            setLatestByUser((prev) => {
              const current = prev.get(ev.user_id);
              if (current && new Date(current.played_at) > new Date(ev.played_at)) {
                return prev;
              }
              const next = new Map(prev);
              next.set(ev.user_id, ev);
              return next;
            });
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "listening_events",
            filter: `user_id=in.(${memberIds.join(",")})`,
          },
          (payload) => {
            const ev = payload.new as ListeningEvent;
            setLatestByUser((prev) => {
              const current = prev.get(ev.user_id);
              if (current?.id === ev.id) {
                const next = new Map(prev);
                next.set(ev.user_id, ev);
                return next;
              }
              return prev;
            });
          }
        )
        .subscribe((status) => {
          // Helpful for debugging: SUBSCRIBED means the channel is live.
          // CHANNEL_ERROR / TIMED_OUT means RLS or network issues.
          console.log(`[ambient realtime] channel status:`, status);
        });
    })();

    return () => {
      isCancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [groupId, members]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {members.map((m) => {
        const event = latestByUser.get(m.user_id);
        const isLive = event?.is_currently_playing ?? false;
        return (
          <div
            key={m.user_id}
            className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800"
          >
            <div className="flex items-center gap-3 mb-4">
              {m.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.avatar_url}
                  alt={m.display_name ?? "Member"}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-zinc-900 dark:text-zinc-50 truncate">
                  {m.display_name ?? "Anonymous"}
                </p>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                      isLive ? "bg-green-500 animate-pulse" : "bg-zinc-400"
                    }`}
                  />
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {isLive ? "Live" : event ? "Last played" : "Quiet"}
                  </span>
                </div>
              </div>
            </div>

            {event ? (
              <a
                href={event.track_url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 group"
              >
                {event.album_art_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.album_art_url}
                    alt={event.album ?? ""}
                    className="w-14 h-14 rounded-md shadow-sm"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-md bg-zinc-100 dark:bg-zinc-800" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 group-hover:underline truncate">
                    {event.track_name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {event.artist}
                  </p>
                </div>
              </a>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Hasn&apos;t listened to anything yet.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
