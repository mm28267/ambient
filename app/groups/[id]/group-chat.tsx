"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, toggleReaction } from "./actions";
import type { Member } from "./group-tiles";

export type ChatMessage = {
  id: string;
  group_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export type Reaction = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

type Props = {
  groupId: string;
  members: Member[];
  initialMessages: ChatMessage[];
  initialReactions: Reaction[];
  currentUserId: string;
};

const QUICK_REACTIONS = ["❤️", "🔥", "👀", "😂", "🎵"];

/**
 * Group chat panel — text messages with emoji reactions and realtime sync.
 *
 * Track plays show in the member tiles above this panel; the chat itself stays
 * focused on conversation.
 */
export default function GroupChat({
  groupId,
  members,
  initialMessages,
  initialReactions,
  currentUserId,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [reactions, setReactions] = useState<Reaction[]>(initialReactions);
  const [draft, setDraft] = useState("");
  const [openReactionPicker, setOpenReactionPicker] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.user_id, m])),
    [members]
  );

  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, Reaction[]>();
    for (const r of reactions) {
      const arr = map.get(r.message_id) ?? [];
      arr.push(r);
      map.set(r.message_id, arr);
    }
    return map;
  }, [reactions]);

  // Auto-scroll on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Realtime: messages + reactions only.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let isCancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (isCancelled) return;
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase
        .channel(`group-${groupId}-chat`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` },
          (payload) => {
            const msg = payload.new as ChatMessage;
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "reactions" },
          (payload) => {
            const r = payload.new as Reaction;
            setReactions((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r]));
          }
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "reactions" },
          (payload) => {
            const r = payload.old as Reaction;
            setReactions((prev) => prev.filter((x) => x.id !== r.id));
          }
        )
        .subscribe();
    })();

    return () => {
      isCancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [groupId]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setError(null);
    setDraft("");
    startTransition(async () => {
      const { error: serverError } = await sendMessage(groupId, body);
      if (serverError) {
        setError(serverError);
        setDraft(body);
      }
    });
  };

  const handleReact = (messageId: string, emoji: string) => {
    setOpenReactionPicker(null);
    startTransition(async () => {
      await toggleReaction(messageId, emoji);
    });
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col h-[480px]">
      <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Chat</h2>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-8">
            No messages yet. Say hi.
          </p>
        ) : (
          messages.map((msg) => {
            const author = memberById.get(msg.user_id);
            const isMe = msg.user_id === currentUserId;
            const msgReactions = reactionsByMessage.get(msg.id) ?? [];

            const grouped = new Map<string, { count: number; mine: boolean }>();
            for (const r of msgReactions) {
              const existing = grouped.get(r.emoji) ?? { count: 0, mine: false };
              existing.count += 1;
              if (r.user_id === currentUserId) existing.mine = true;
              grouped.set(r.emoji, existing);
            }

            return (
              <div key={msg.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
                {author?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={author.avatar_url}
                    alt={author.display_name ?? "Member"}
                    className="w-8 h-8 rounded-full flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex-shrink-0" />
                )}
                <div className={`flex-1 min-w-0 ${isMe ? "text-right" : ""}`}>
                  <div className={`flex items-baseline gap-2 mb-0.5 ${isMe ? "justify-end" : ""}`}>
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      {isMe ? "You" : author?.display_name ?? "Anonymous"}
                    </span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="group inline-block relative">
                    <div
                      className={`px-3 py-2 rounded-2xl text-sm max-w-[85%] ${
                        isMe
                          ? "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50"
                      }`}
                    >
                      {msg.body}
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenReactionPicker((cur) => (cur === msg.id ? null : msg.id))}
                      className={`absolute -top-3 ${
                        isMe ? "-left-8" : "-right-8"
                      } w-7 h-7 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 opacity-0 group-hover:opacity-100 transition-opacity text-sm`}
                      aria-label="React"
                    >
                      +
                    </button>
                    {openReactionPicker === msg.id && (
                      <div
                        className={`absolute z-10 ${isMe ? "right-0" : "left-0"} top-full mt-1 flex gap-1 p-1 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-lg`}
                      >
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleReact(msg.id, emoji)}
                            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors text-base"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {grouped.size > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : ""}`}>
                      {[...grouped.entries()].map(([emoji, info]) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleReact(msg.id, emoji)}
                          className={`px-2 h-6 inline-flex items-center gap-1 rounded-full border text-xs transition-colors ${
                            info.mine
                              ? "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900 text-green-800 dark:text-green-300"
                              : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
                          }`}
                        >
                          <span>{emoji}</span>
                          <span>{info.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t border-zinc-200 dark:border-zinc-800 p-3 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Say something…"
          rows={1}
          maxLength={2000}
          className="flex-1 resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="h-10 px-4 rounded-lg bg-zinc-900 dark:bg-zinc-50 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed text-white dark:text-zinc-900 text-sm font-medium transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
