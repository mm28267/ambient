import type { BusyWindow } from "@/lib/google/calendar";

/**
 * Convert a list of busy windows into a single short status string suitable
 * for the vibes panel — e.g. "In a meeting until 3:00 PM",
 * "Free until 2:00 PM", "Free for the rest of the day".
 *
 * Tries to give the user the next-most-useful piece of information given
 * the current time.
 */
export function computeCalendarStatus(
  busy: BusyWindow[],
  now: Date = new Date()
): string {
  const nowMs = now.getTime();
  const dayEnd = new Date(now);
  dayEnd.setHours(22, 0, 0, 0); // treat 10pm as "rest of the day" boundary

  // Normalize and filter to upcoming or current relevance.
  const windows = busy
    .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
    .filter((w) => w.end > nowMs)
    .sort((a, b) => a.start - b.start);

  // Are we currently in a busy block?
  const currentlyBusy = windows.find((w) => w.start <= nowMs && w.end > nowMs);
  if (currentlyBusy) {
    // If multiple back-to-back busy blocks, chain them so we report the
    // moment they're truly free again.
    let endOfBusyChain = currentlyBusy.end;
    for (const w of windows) {
      if (w.start <= endOfBusyChain && w.end > endOfBusyChain) {
        endOfBusyChain = w.end;
      }
    }
    return `Busy until ${formatTime(new Date(endOfBusyChain))}`;
  }

  // Free now. Is there a busy block coming up later today?
  const nextBusy = windows.find((w) => w.start > nowMs && w.start < dayEnd.getTime());
  if (nextBusy) {
    return `Free until ${formatTime(new Date(nextBusy.start))}`;
  }

  // Truly free for the rest of the day.
  if (nowMs > dayEnd.getTime()) {
    return "Done for the day";
  }
  return "Free for the rest of the day";
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
