"use client";

import { useEffect } from "react";
import { pingPresence } from "./presence-actions";

/**
 * On dashboard mount, sends the user's IANA timezone (e.g. "America/New_York")
 * and refreshes their last_seen_at on the server. Pings again every 60s while
 * the page is open so "last seen" stays current.
 *
 * Renders nothing.
 */
export default function PresencePinger() {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    // Initial ping.
    pingPresence(tz).catch(() => {});

    // Heartbeat every minute.
    const id = setInterval(() => {
      pingPresence(tz).catch(() => {});
    }, 60_000);

    return () => clearInterval(id);
  }, []);

  return null;
}
