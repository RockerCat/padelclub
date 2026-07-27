// Period presets for Phase 9 (club operational statistics) — deliberately a
// separate, smaller module from dashboardRange.ts: that one models
// this_week/last_week/this_semester/custom, none of which this phase's
// spec allows. Reusing/extending it would mean changing behavior the
// existing Dashboard page depends on, which is out of scope here.
//
// All boundaries are computed as America/Bogota CALENDAR dates (never
// server-local time, never UTC) via Intl — Colombia has no DST, but using
// Intl instead of a hardcoded "-05:00" offset means this stays correct if
// that ever changed, with no code edit required. Once anchored to a
// YYYY-MM-DD string, all further add/subtract-day and month arithmetic is
// done on a UTC-midnight Date solely as a calendar-math scratchpad — never
// reinterpreted as a real instant — so no other timezone can leak in.

export type StatsPeriodKey = "last7" | "last30" | "last90" | "thisMonth" | "lastMonth";

export const STATS_PERIOD_OPTIONS: { key: StatsPeriodKey; label: string }[] = [
  { key: "last7", label: "Últimos 7 días" },
  { key: "last30", label: "Últimos 30 días" },
  { key: "last90", label: "Últimos 90 días" },
  { key: "thisMonth", label: "Este mes" },
  { key: "lastMonth", label: "Mes anterior" },
];

const DEFAULT_PERIOD: StatsPeriodKey = "last30";

export function isStatsPeriodKey(value: string | undefined): value is StatsPeriodKey {
  return !!value && STATS_PERIOD_OPTIONS.some((o) => o.key === value);
}

export function resolveStatsPeriodKey(value: string | undefined): StatsPeriodKey {
  return isStatsPeriodKey(value) ? value : DEFAULT_PERIOD;
}

function bogotaTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

function toUTCDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const d = toUTCDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

function firstOfMonthISO(iso: string): string {
  const d = toUTCDate(iso);
  d.setUTCDate(1);
  return toISO(d);
}

// Day 0 of the current month is the last day of the previous month — a
// standard JS/UTC Date rollback trick, no month-length lookup table needed.
function lastOfPrevMonthISO(iso: string): string {
  const d = toUTCDate(firstOfMonthISO(iso));
  d.setUTCDate(0);
  return toISO(d);
}

export interface StatsPeriodBounds {
  start: string; // YYYY-MM-DD, inclusive
  end: string;   // YYYY-MM-DD, inclusive
}

export function resolveStatsPeriod(key: StatsPeriodKey): StatsPeriodBounds {
  const today = bogotaTodayISO();
  switch (key) {
    case "last7":
      return { start: addDaysISO(today, -6), end: today };
    case "last30":
      return { start: addDaysISO(today, -29), end: today };
    case "last90":
      return { start: addDaysISO(today, -89), end: today };
    case "thisMonth":
      return { start: firstOfMonthISO(today), end: today };
    case "lastMonth": {
      const end = lastOfPrevMonthISO(today);
      return { start: firstOfMonthISO(end), end };
    }
  }
}
