"use client";

/**
 * /demo — fully self-contained demo version of the group page.
 *
 * No Supabase calls, no OAuth, no realtime, no cron. Everything is hardcoded
 * client-side data with local state for interactive bits (RSVP, chat,
 * dismiss). Use this for the capstone presentation and demo video so the
 * experience never depends on external services.
 */

import { useState } from "react";

// ============================================================================
// MOCK DATA
// ============================================================================

type Member = {
  user_id: string;
  display_name: string;
  avatar_url: string;
  city: string;
  timezone: string;
  weather_emoji: string;
  weather_temp_f: number;
  calendar_status: string;
  is_active: boolean;
  last_seen_min_ago: number | null;
  current_track: {
    name: string;
    artist: string;
    album: string;
    album_art_url: string;
    is_live: boolean;
  };
};

const MEMBERS: Member[] = [
  {
    user_id: "u-maral",
    display_name: "You",
    avatar_url: "/demo-photos/Maral.jpg",
    city: "New York",
    timezone: "America/New_York",
    weather_emoji: "🌤️",
    weather_temp_f: 68,
    calendar_status: "Free until 6:00 PM",
    is_active: true,
    last_seen_min_ago: null,
    current_track: {
      name: "Guillotine",
      artist: "Mansionair, NoMBe",
      album: "Happiness, Guaranteed",
      album_art_url: "",
      is_live: true,
    },
  },
  {
    user_id: "u-robyn",
    display_name: "Robyn",
    avatar_url: "/demo-photos/Robyn.jpeg",
    city: "Maryland",
    timezone: "America/New_York",
    weather_emoji: "☁️",
    weather_temp_f: 62,
    calendar_status: "Busy until 4:00 PM",
    is_active: true,
    last_seen_min_ago: 2,
    current_track: {
      name: "Hot Mess",
      artist: "Zoe Clark",
      album: "Hot Mess - Single",
      album_art_url: "",
      is_live: false,
    },
  },
  {
    user_id: "u-isabelle",
    display_name: "Isabelle",
    avatar_url: "/demo-photos/Isabelle.jpg",
    city: "Queensland",
    timezone: "Australia/Brisbane",
    weather_emoji: "🌧️",
    weather_temp_f: 75,
    calendar_status: "Asleep until 7:00 AM",
    is_active: false,
    last_seen_min_ago: 47,
    current_track: {
      name: "Barely in the Minute",
      artist: "Hamster",
      album: "Slow Lane",
      album_art_url: "",
      is_live: false,
    },
  },
  {
    user_id: "u-zoltan",
    display_name: "Zoltan",
    avatar_url: "/demo-photos/Zoltan.jpeg",
    city: "Cleveland",
    timezone: "America/New_York",
    weather_emoji: "❄️",
    weather_temp_f: 35,
    calendar_status: "In a meeting until 5:00 PM",
    is_active: false,
    last_seen_min_ago: 18,
    current_track: {
      name: "See You Again (feat. Kali Uchis)",
      artist: "Tyler, The Creator, Kali Uchis",
      album: "Flower Boy",
      album_art_url: "",
      is_live: false,
    },
  },
  {
    user_id: "u-erik",
    display_name: "Erik",
    avatar_url: "/demo-photos/Erik.jpeg",
    city: "Ottawa",
    timezone: "America/Toronto",
    weather_emoji: "🌤️",
    weather_temp_f: 54,
    calendar_status: "Free until 7:00 PM",
    is_active: true,
    last_seen_min_ago: 5,
    current_track: {
      name: "Run",
      artist: "Joji",
      album: "BALLADS 1",
      album_art_url: "",
      is_live: true,
    },
  },
];

const CURRENT_USER_ID = "u-maral";

const DEMO_PHOTOS = [
  { id: "p1", user_id: "u-robyn", url: "/demo-photos/Upload1.avif" },
  { id: "p2", user_id: "u-isabelle", url: "/demo-photos/Upload2.avif" },
  { id: "p3", user_id: "u-maral", url: "/demo-photos/Upload3.jpeg" },
  { id: "p4", user_id: "u-erik", url: "/demo-photos/Upload4.jpeg" },
];

type ChatMessage = {
  id: string;
  user_id: string;
  body: string;
  time: string;
  reactions: { emoji: string; count: number; mine: boolean }[];
};

const INITIAL_MESSAGES: ChatMessage[] = [
  { id: "m1", user_id: "u-isabelle", body: "did everyone see Robyn's new place?? 😍", time: "10:42 AM", reactions: [{ emoji: "😍", count: 2, mine: true }] },
  { id: "m2", user_id: "u-robyn", body: "still unpacking but coffee corner is officially set up", time: "10:45 AM", reactions: [{ emoji: "❤️", count: 3, mine: false }] },
  { id: "m3", user_id: "u-zoltan", body: "we should video call this weekend", time: "11:02 AM", reactions: [] },
];

// ============================================================================
// COMPONENT
// ============================================================================

// Rotation of proposed catch-up times. The "Suggest a new time" button
// cycles through these so the demo can show the loop continuing.
const PROPOSED_TIMES = [
  { date: "Saturday, May 9", time: "8:00 PM – 10:00 PM" },
  { date: "Sunday, May 10", time: "7:00 PM – 9:00 PM" },
  { date: "Friday, May 15", time: "6:30 PM – 8:30 PM" },
];

// Tracks Maral cycles through when she clicks her own member tile.
const MARAL_TRACKS = [
  { name: "Guillotine", artist: "Mansionair, NoMBe", album: "Happiness, Guaranteed", album_art_url: "", is_live: true },
  { name: "Ribs", artist: "Lorde", album: "Pure Heroine", album_art_url: "", is_live: true },
  { name: "Snow on the Beach", artist: "Taylor Swift, Lana Del Rey", album: "Midnights", album_art_url: "", is_live: true },
  { name: "Vienna", artist: "Billy Joel", album: "The Stranger", album_art_url: "", is_live: true },
];

const INITIAL_RSVPS: Record<string, "in" | "out" | null> = {
  "u-robyn": "in",
  "u-isabelle": "in",
  "u-zoltan": "in",
  "u-erik": "in",
};

export default function DemoPage() {
  // Catch-up suggestion state — every other member is already "in" (4/5),
  // so the user is the final vote. Threshold is everyone in the group.
  const [rsvps, setRsvps] = useState<Record<string, "in" | "out" | null>>(INITIAL_RSVPS);
  const [confirmed, setConfirmed] = useState(false);
  const [proposedIdx, setProposedIdx] = useState(0);

  // Maral's currently-playing track (cycles when she clicks her own tile)
  const [maralTrackIdx, setMaralTrackIdx] = useState(0);
  const [trackJustChanged, setTrackJustChanged] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState("");

  const memberById = new Map(MEMBERS.map((m) => [m.user_id, m]));

  const inCount = Object.values(rsvps).filter((r) => r === "in").length;
  const outCount = Object.values(rsvps).filter((r) => r === "out").length;
  const myResponse = rsvps[CURRENT_USER_ID] ?? null;
  const threshold = MEMBERS.length;
  const proposed = PROPOSED_TIMES[proposedIdx];
  const maralTrack = MARAL_TRACKS[maralTrackIdx];

  const handleRsvp = (response: "in" | "out") => {
    setRsvps((prev) => ({ ...prev, [CURRENT_USER_ID]: response }));
    // User is the deciding vote — confirm immediately on "I'm in".
    if (response === "in") {
      setTimeout(() => setConfirmed(true), 700);
    }
  };

  const handleSuggestNewTime = () => {
    setProposedIdx((prev) => (prev + 1) % PROPOSED_TIMES.length);
    setRsvps(INITIAL_RSVPS);
    setConfirmed(false);
  };

  const handleCycleMaralTrack = () => {
    setMaralTrackIdx((prev) => (prev + 1) % MARAL_TRACKS.length);
    setTrackJustChanged(true);
    setTimeout(() => setTrackJustChanged(false), 600);
  };

  const handleReset = () => {
    setRsvps(INITIAL_RSVPS);
    setConfirmed(false);
    setProposedIdx(0);
  };

  const handleSendMessage = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    const newMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      user_id: CURRENT_USER_ID,
      body,
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      reactions: [],
    };
    setMessages([...messages, newMsg]);
    setDraft("");

    // Auto-reply for demo flair
    setTimeout(() => {
      const replies = [
        { user_id: "u-robyn", body: "for sure!" },
        { user_id: "u-isabelle", body: "haha exactly" },
        { user_id: "u-zoltan", body: "👀" },
        { user_id: "u-erik", body: "same" },
      ];
      const reply = replies[Math.floor(Math.random() * replies.length)];
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}-r`,
          user_id: reply.user_id,
          body: reply.body,
          time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
          reactions: [],
        },
      ]);
    }, 1800);
  };

  const formatLastSeen = (min: number) => {
    if (min < 1) return "just now";
    if (min < 60) return `active ${min}m ago`;
    return "earlier today";
  };

  const formatLocalTime = (tz: string) =>
    new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date());

  // Compute a calendar status that's always coherent with the member's local
  // time, so the demo never shows "Free until 6 PM" when it's already 7 PM
  // for that person. Each member has a daytime behavior pattern (free / busy /
  // meeting) that kicks in once they're awake; outside of waking hours they
  // read as asleep.
  const localHourFor = (tz: string): number => {
    const h = new Intl.DateTimeFormat("en-US", {
      hour: "numeric", hour12: false, timeZone: tz,
    }).format(new Date());
    const n = parseInt(h, 10);
    return n === 24 ? 0 : n;
  };

  const formatHour = (h: number): string => {
    const period = h >= 12 ? "PM" : "AM";
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display}:00 ${period}`;
  };

  const calendarStatusFor = (m: Member): string => {
    const hour = localHourFor(m.timezone);
    if (hour < 7 || hour >= 23) return "Asleep until 7:00 AM";

    const patterns: Record<string, { kind: "free" | "busy" | "meeting"; hours: number }> = {
      "u-maral": { kind: "free", hours: 4 },
      "u-robyn": { kind: "busy", hours: 2 },
      "u-isabelle": { kind: "free", hours: 5 },
      "u-zoltan": { kind: "meeting", hours: 2 },
      "u-erik": { kind: "free", hours: 4 },
    };
    const p = patterns[m.user_id] ?? { kind: "free", hours: 3 };
    const endHour = Math.min(hour + p.hours, 22);
    const label = formatHour(endHour);

    if (p.kind === "busy") return `Busy until ${label}`;
    if (p.kind === "meeting") return `In a meeting until ${label}`;
    return `Free until ${label}`;
  };

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Group header */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-3xl">
            🌊
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">London Friends</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {MEMBERS.length} members · Catching up every 14 days
            </p>
          </div>
        </div>

        {/* Vibes panel */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Vibes</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">What everyone&apos;s up to right now.</p>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {MEMBERS.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 px-5 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.avatar_url} alt={m.display_name} className="w-9 h-9 rounded-full flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">{m.display_name}</p>
                    {m.is_active ? (
                      <span className="inline-flex items-center gap-1 text-xs flex-shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-green-700 dark:text-green-400">Here now</span>
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                        {m.last_seen_min_ago != null ? formatLastSeen(m.last_seen_min_ago) : "earlier"}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    <span>🕓 {formatLocalTime(m.timezone)}</span>
                    <span>
                      {m.weather_emoji} {m.weather_temp_f}°
                    </span>
                    <span className="text-zinc-600 dark:text-zinc-300">📅 {calendarStatusFor(m)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Member tiles (currently playing) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MEMBERS.map((m) => {
            const isMe = m.user_id === CURRENT_USER_ID;
            const track = isMe ? maralTrack : m.current_track;
            return (
              <div
                key={m.user_id}
                onClick={isMe ? handleCycleMaralTrack : undefined}
                title={isMe ? "Click to skip to the next track" : undefined}
                className={`bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 ${
                  isMe ? "cursor-pointer hover:border-green-400 dark:hover:border-green-700 transition-colors" : ""
                } ${trackJustChanged && isMe ? "ring-2 ring-green-400 dark:ring-green-600" : ""}`}
              >
                <div className="flex items-center gap-3 mb-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.avatar_url} alt={m.display_name} className="w-10 h-10 rounded-full" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50 truncate">{m.display_name}</p>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${
                          track.is_live ? "bg-green-500 animate-pulse" : "bg-zinc-400"
                        }`}
                      />
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {track.is_live ? "Live" : "Last played"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-md bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-800 flex-shrink-0 flex items-center justify-center text-xl">
                    🎵
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">{track.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{track.artist}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Catch-up card */}
        {confirmed ? (
          <div className="bg-gradient-to-br from-green-100 to-green-50 dark:from-green-950/40 dark:to-green-900/20 rounded-2xl p-6 border border-green-300 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">✅</span>
              <h3 className="text-sm font-medium text-green-900 dark:text-green-200">Catch-up confirmed</h3>
            </div>
            <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50 mb-1">{proposed.date}</p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">{proposed.time}</p>
            <div className="flex flex-wrap gap-1 mb-2">
              {MEMBERS.filter((m) => rsvps[m.user_id] === "in").map((m) => (
                <span
                  key={m.user_id}
                  className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-full bg-white dark:bg-zinc-900 border border-green-300 dark:border-green-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.avatar_url} alt="" className="w-4 h-4 rounded-full" />
                  <span className="text-zinc-700 dark:text-zinc-300">{m.display_name}</span>
                </span>
              ))}
            </div>
            <p className="text-xs text-green-800 dark:text-green-300">📩 Calendar invites sent.</p>
            <button
              onClick={handleReset}
              className="mt-3 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline"
            >
              Reset for the demo
            </button>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-green-50 to-zinc-50 dark:from-green-950/30 dark:to-zinc-900 rounded-2xl p-6 border border-green-200 dark:border-green-900/50">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">📅</span>
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Suggested catch-up</h3>
            </div>
            <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50 mb-1">{proposed.date}</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">{proposed.time}</p>
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => handleRsvp("in")}
                className={`flex-1 h-10 rounded-full text-sm font-medium transition-colors ${
                  myResponse === "in"
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-zinc-700 hover:border-green-500"
                }`}
              >
                I&apos;m in
              </button>
              <button
                onClick={() => handleRsvp("out")}
                className={`flex-1 h-10 rounded-full text-sm font-medium transition-colors ${
                  myResponse === "out"
                    ? "bg-zinc-600 hover:bg-zinc-700 text-white"
                    : "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-zinc-700"
                }`}
              >
                Can&apos;t
              </button>
            </div>
            <button
              onClick={handleSuggestNewTime}
              className="w-full h-9 rounded-full text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 mb-3 transition-colors"
            >
              Suggest a different time
            </button>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {inCount} of {threshold} in
              {outCount > 0 ? ` · ${outCount} can't make it` : ""}
              {myResponse === null && inCount === threshold - 1 ? " — waiting on you." : `.`}
            </p>
          </div>
        )}

        {/* Photos */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Photos</h2>
            <button
              type="button"
              className="text-xs font-medium px-3 py-1.5 rounded-full bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900"
            >
              + Add photo
            </button>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {DEMO_PHOTOS.map((p) => {
                const author = memberById.get(p.user_id);
                return (
                  <div key={p.id} className="relative rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="w-full aspect-square object-cover" />
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent flex items-center gap-1.5">
                      {author && (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={author.avatar_url} alt="" className="w-5 h-5 rounded-full ring-1 ring-white" />
                          <span className="text-xs text-white">{author.display_name}</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col h-[420px]">
          <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Chat</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => {
              const author = memberById.get(msg.user_id);
              const isMe = msg.user_id === CURRENT_USER_ID;
              return (
                <div key={msg.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={author?.avatar_url} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                  <div className={`flex-1 min-w-0 ${isMe ? "text-right" : ""}`}>
                    <div className={`flex items-baseline gap-2 mb-0.5 ${isMe ? "justify-end" : ""}`}>
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {isMe ? "You" : author?.display_name}
                      </span>
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">{msg.time}</span>
                    </div>
                    <div
                      className={`inline-block px-3 py-2 rounded-2xl text-sm max-w-[85%] ${
                        isMe
                          ? "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50"
                      }`}
                    >
                      {msg.body}
                    </div>
                    {msg.reactions.length > 0 && (
                      <div className={`flex gap-1 mt-1 ${isMe ? "justify-end" : ""}`}>
                        {msg.reactions.map((r) => (
                          <span
                            key={r.emoji}
                            className={`px-2 h-6 inline-flex items-center gap-1 rounded-full border text-xs ${
                              r.mine
                                ? "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900 text-green-800 dark:text-green-300"
                                : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                            }`}
                          >
                            <span>{r.emoji}</span>
                            <span>{r.count}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <form onSubmit={handleSendMessage} className="border-t border-zinc-200 dark:border-zinc-800 p-3 flex items-end gap-2">
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
              className="flex-1 resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="h-10 px-4 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
