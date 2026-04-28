"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** How often to refresh, in milliseconds. Default 30s. */
  intervalMs?: number;
};

/**
 * Calls router.refresh() on an interval.
 *
 * router.refresh() re-runs the Server Component for the current page on the
 * server and merges the new data into the existing client tree, without a
 * hard reload. We use it on the dashboard to keep the user's listening_events
 * row fresh — every refresh = new Spotify call + database insert if the track
 * changed, which lets Realtime broadcast to other group members in near-real-time.
 *
 * Cheap and effective. We'll replace this with a proper background poll
 * (Vercel Cron) later, but for development + small-group use it works fine.
 */
export default function AutoRefresh({ intervalMs = 30_000 }: Props) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
