// Pure time/availability-grid helpers — no React, no hooks, no browser APIs,
// no "use client". Safe to import from Server Components (e.g. the admin
// reservation review page) and from Client Components (the player
// availability calendar, the shared CourtAvailabilityTimeline components)
// alike. Never add anything here that depends on React or the DOM.

export function timeToMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minsToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function addMinutes(time: string, mins: number): string {
  return minsToTime(timeToMins(time) + mins);
}

// Rebuilds the same 30-minute base grid the server generates for a day's
// operating window — purely so the timeline has ticks to render. Whether a
// given tick is selectable/occupied/requested still comes from the real
// slots/blocked data passed in, never from this grid alone.
export function buildDayGrid(openMins: number | undefined, closeMins: number | undefined, minDuration: number): string[] {
  if (openMins === undefined || closeMins === undefined) return [];
  const grid: string[] = [];
  for (let t = openMins; t + minDuration <= closeMins; t += 30) grid.push(minsToTime(t));
  return grid;
}
