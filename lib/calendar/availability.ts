import type { UserBusy } from "@/lib/google/calendar";

export type FreeWindow = {
  start: Date;
  end: Date;
};

/**
 * Compute time blocks where ALL members are free (intersection of their
 * free time) within a given range. Output is sorted earliest-first.
 *
 * Algorithm:
 *   1. Collect every user's busy windows into one big array.
 *   2. Sort and merge overlapping windows.
 *   3. The "common free" windows are the gaps between merged busy windows.
 *
 * Members with `error` set are skipped (we can't know their availability,
 * so we treat them as "always free" — better than blocking everyone).
 */
export function findCommonFree(
  usersBusy: UserBusy[],
  rangeStart: Date,
  rangeEnd: Date,
  minDurationMs = 60 * 60 * 1000 // 1 hour
): FreeWindow[] {
  const allBusy: { start: number; end: number }[] = [];
  for (const u of usersBusy) {
    if (u.error) continue;
    for (const b of u.busy) {
      const start = new Date(b.start).getTime();
      const end = new Date(b.end).getTime();
      // Clip to our range.
      const clippedStart = Math.max(start, rangeStart.getTime());
      const clippedEnd = Math.min(end, rangeEnd.getTime());
      if (clippedEnd > clippedStart) {
        allBusy.push({ start: clippedStart, end: clippedEnd });
      }
    }
  }

  // Sort and merge overlapping windows.
  allBusy.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const w of allBusy) {
    const last = merged[merged.length - 1];
    if (!last || w.start > last.end) {
      merged.push({ ...w });
    } else {
      last.end = Math.max(last.end, w.end);
    }
  }

  // Free windows = gaps between merged busy windows, within the range.
  const free: FreeWindow[] = [];
  let cursor = rangeStart.getTime();
  for (const w of merged) {
    if (w.start > cursor) {
      free.push({ start: new Date(cursor), end: new Date(w.start) });
    }
    cursor = Math.max(cursor, w.end);
  }
  if (cursor < rangeEnd.getTime()) {
    free.push({ start: new Date(cursor), end: new Date(rangeEnd.getTime()) });
  }

  return free.filter(
    (w) => w.end.getTime() - w.start.getTime() >= minDurationMs
  );
}

/**
 * Filter free windows to only "reasonable" hours (evening / weekend afternoon).
 *
 * For each day, we propose multiple 2-hour candidate slots — e.g. on weekends
 * 10a, 12p, 2p, 4p, 6p, 8p — so cycling through suggestions varies the time
 * of day, not just the date.
 *
 * Hours are interpreted in the runtime's local timezone for capstone simplicity;
 * a future version would do this per-user-timezone.
 */
export function filterToReasonableHours(windows: FreeWindow[]): FreeWindow[] {
  const out: FreeWindow[] = [];
  const SLOT_HOURS = 2; // proposed catch-up duration
  const STEP_HOURS = 2; // how far apart starting hours are

  for (const w of windows) {
    // Walk the window day by day.
    let cursor = new Date(w.start);
    while (cursor < w.end) {
      const dayStart = new Date(cursor);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const isWeekend = dayStart.getDay() === 0 || dayStart.getDay() === 6;
      // Reasonable hour bounds per day type.
      const reasonableStartHour = isWeekend ? 10 : 17; // 10am weekends, 5pm weekdays
      const reasonableEndHour = 22; // 10pm both

      // Try each candidate start hour within reasonable hours.
      for (let h = reasonableStartHour; h + SLOT_HOURS <= reasonableEndHour; h += STEP_HOURS) {
        const slotStart = new Date(dayStart);
        slotStart.setHours(h, 0, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + SLOT_HOURS * 60 * 60 * 1000);

        // Slot must be entirely within the free window AND in the future.
        if (slotStart < w.start) continue;
        if (slotEnd > w.end) continue;
        if (slotEnd > dayEnd) continue;
        out.push({ start: slotStart, end: slotEnd });
      }

      cursor = dayEnd;
    }
  }

  return out;
}

/**
 * Score a free window. Higher = more "prime" social time.
 *  - Saturday 8pm anchor (closer = higher)
 *  - Weekend bonus
 */
export function scoreWindow(w: FreeWindow): number {
  const day = w.start.getDay();
  const hour = w.start.getHours();
  const dayOfWeekScore = day === 6 ? 3 : day === 0 ? 2 : 1; // Sat > Sun > weekday
  const hourScore = -Math.abs(hour - 20); // distance from 8pm
  return dayOfWeekScore * 10 + hourScore;
}
