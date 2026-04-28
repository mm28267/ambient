"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { rsvpToSuggestion, dismissSuggestion } from "./actions";
import type { Member } from "./group-tiles";

export type Suggestion = {
  id: string;
  group_id: string;
  suggested_start: string;
  suggested_end: string;
  status: "pending" | "confirmed" | "expired" | "declined";
  google_event_id: string | null;
};

export type RSVP = {
  suggestion_id: string;
  user_id: string;
  response: "in" | "out";
};

type Props = {
  groupId: string;
  members: Member[];
  suggestion: Suggestion;
  initialRsvps: RSVP[];
  currentUserId: string;
};

/**
 * The "Suggested catch-up" card with RSVP buttons.
 * Realtime-subscribed so all members see RSVPs and confirmation as they happen.
 */
export default function CatchupCard({
  groupId,
  members,
  suggestion: initialSuggestion,
  initialRsvps,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [suggestion, setSuggestion] = useState<Suggestion>(initialSuggestion);
  const [rsvps, setRsvps] = useState<RSVP[]>(initialRsvps);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDismiss = () => {
    setError(null);
    startTransition(async () => {
      const { error: serverError } = await dismissSuggestion(suggestion.id);
      if (serverError) {
        setError(serverError);
      } else {
        router.refresh();
      }
    });
  };

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let isCancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (isCancelled) return;
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`group-${groupId}-catchup-${suggestion.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "catchup_rsvps", filter: `suggestion_id=eq.${suggestion.id}` },
          (payload) => {
            if (payload.eventType === "DELETE") {
              const old = payload.old as RSVP;
              setRsvps((prev) => prev.filter((r) => r.user_id !== old.user_id));
            } else {
              const row = payload.new as RSVP;
              setRsvps((prev) => {
                const without = prev.filter((r) => r.user_id !== row.user_id);
                return [...without, row];
              });
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "catchup_suggestions", filter: `id=eq.${suggestion.id}` },
          (payload) => {
            setSuggestion(payload.new as Suggestion);
          }
        )
        .subscribe();
    })();

    return () => {
      isCancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [groupId, suggestion.id]);

  const inCount = rsvps.filter((r) => r.response === "in").length;
  const outCount = rsvps.filter((r) => r.response === "out").length;
  const myResponse = rsvps.find((r) => r.user_id === currentUserId)?.response ?? null;
  const inMembers = members.filter((m) =>
    rsvps.some((r) => r.user_id === m.user_id && r.response === "in")
  );

  const handleRsvp = (response: "in" | "out") => {
    setError(null);
    // Optimistic update.
    setRsvps((prev) => {
      const without = prev.filter((r) => r.user_id !== currentUserId);
      return [...without, { suggestion_id: suggestion.id, user_id: currentUserId, response }];
    });
    startTransition(async () => {
      const { error: serverError } = await rsvpToSuggestion(suggestion.id, response);
      if (serverError) setError(serverError);
    });
  };

  const startDate = new Date(suggestion.suggested_start);
  const endDate = new Date(suggestion.suggested_end);
  const dayLabel = startDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const timeLabel = `${startDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – ${endDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

  // Confirmed view
  if (suggestion.status === "confirmed") {
    return (
      <div className="bg-gradient-to-br from-green-100 to-green-50 dark:from-green-950/40 dark:to-green-900/20 rounded-2xl p-6 border border-green-300 dark:border-green-800">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">✅</span>
          <h3 className="text-sm font-medium text-green-900 dark:text-green-200">
            Catch-up confirmed
          </h3>
        </div>
        <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50 mb-1">{dayLabel}</p>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">{timeLabel}</p>
        <div className="flex flex-wrap gap-1 mb-2">
          {inMembers.map((m) => (
            <span
              key={m.user_id}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-full bg-white dark:bg-zinc-900 border border-green-300 dark:border-green-800"
            >
              {m.avatar_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.avatar_url} alt="" className="w-4 h-4 rounded-full" />
              )}
              <span className="text-zinc-700 dark:text-zinc-300">{m.display_name ?? "Anonymous"}</span>
            </span>
          ))}
        </div>
        {suggestion.google_event_id ? (
          <p className="text-xs text-green-800 dark:text-green-300">
            📩 Calendar invites sent.
          </p>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Confirmed (no calendar invite was sent — connect Google to enable invites).
          </p>
        )}
        <button
          onClick={handleDismiss}
          disabled={isPending}
          className="mt-3 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline disabled:opacity-50"
        >
          Reset for a new suggestion
        </button>
      </div>
    );
  }

  // Pending view
  return (
    <div className="bg-gradient-to-br from-green-50 to-zinc-50 dark:from-green-950/30 dark:to-zinc-900 rounded-2xl p-6 border border-green-200 dark:border-green-900/50">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">📅</span>
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Suggested catch-up
        </h3>
      </div>
      <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50 mb-1">{dayLabel}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">{timeLabel}</p>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => handleRsvp("in")}
          disabled={isPending}
          className={`flex-1 h-10 rounded-full text-sm font-medium transition-colors disabled:opacity-50 ${
            myResponse === "in"
              ? "bg-green-600 hover:bg-green-700 text-white"
              : "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-zinc-700 hover:border-green-500 dark:hover:border-green-700"
          }`}
        >
          I&apos;m in
        </button>
        <button
          onClick={() => handleRsvp("out")}
          disabled={isPending}
          className={`flex-1 h-10 rounded-full text-sm font-medium transition-colors disabled:opacity-50 ${
            myResponse === "out"
              ? "bg-zinc-600 hover:bg-zinc-700 text-white"
              : "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500"
          }`}
        >
          Can&apos;t
        </button>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {inCount} {inCount === 1 ? "person is" : "people are"} in
        {outCount > 0 ? ` · ${outCount} can't make it` : ""}
        . Need {Math.min(3, members.length)} to confirm.
      </p>
      <button
        onClick={handleDismiss}
        disabled={isPending}
        className="mt-3 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline disabled:opacity-50"
      >
        Suggest a different time
      </button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>
      )}
    </div>
  );
}
