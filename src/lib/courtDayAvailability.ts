import { getEffectiveHour, timeToMinutes } from "@/lib/operatingHours";
import type { OperatingHour } from "@/lib/operatingHours";

// Server-safe (no "use client") day/court availability grid — the exact
// same computation the player Reservations page has always used, now also
// reused by the OWNER/ADMIN "Disponibilidad" view (admin/reservations)
// so neither can drift into a second, slightly different availability rule.

export type RawReservation = {
  court_id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
};

// Blocked windows per date per court: [startMins, endMins][]
export type BlockedByDate = Record<string, Record<string, Array<[number, number]>>>;

function minsToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export interface CourtDayAvailability {
  availability: Record<string, Record<string, string[]>>;
  closedDates: string[];
  openingMinsByDate: Record<string, number>;
  closingMinsByDate: Record<string, number>;
  blockedByDate: BlockedByDate;
}

// `reservations` should include every status that legitimately blocks a
// slot (confirmed + pending) — a pending request already holds its slot the
// same way a confirmed one does; rejected/cancelled never block anything,
// so callers simply never include those rows here.
export function computeAvailability(
  courts: Array<{ id: string }>,
  weekDates: string[],
  opHours: OperatingHour[],
  reservations: RawReservation[],
  todayStr: string,
  nowMins: number,
  minDuration: number, // smallest allowed duration → base slot filter
): CourtDayAvailability {
  const availability: Record<string, Record<string, string[]>> = {};
  const closedDates: string[] = [];
  const openingMinsByDate: Record<string, number> = {};
  const closingMinsByDate: Record<string, number> = {};
  const blockedByDate: BlockedByDate = {};

  for (const date of weekDates) {
    const dayOfWeek = new Date(date + "T00:00:00").getDay();
    const hours = getEffectiveHour(opHours, dayOfWeek);
    availability[date] = {};
    blockedByDate[date] = {};

    if (!hours.is_open || !hours.opens_at || !hours.closes_at) {
      closedDates.push(date);
      for (const court of courts) {
        availability[date][court.id] = [];
        blockedByDate[date][court.id] = [];
      }
      continue;
    }

    const openMins = timeToMinutes(hours.opens_at);
    const closeMins = timeToMinutes(hours.closes_at);
    openingMinsByDate[date] = openMins;
    closingMinsByDate[date] = closeMins;

    // Base slots: 30-min aligned, fit the minimum allowed duration before close
    const baseSlots: string[] = [];
    for (let t = openMins; t + minDuration <= closeMins; t += 30) {
      baseSlots.push(minsToTime(t));
    }

    const futureSlots =
      date === todayStr
        ? baseSlots.filter((s) => timeToMinutes(s) > nowMins)
        : baseSlots;

    for (const court of courts) {
      const courtRes = reservations.filter(
        (r) => r.court_id === court.id && r.date === date,
      );

      // Store blocked windows for client-side duration filtering
      blockedByDate[date][court.id] = courtRes.map((r) => {
        const rStart = timeToMinutes(r.start_time);
        return [rStart, rStart + r.duration_minutes] as [number, number];
      });

      // Default available slots (blocked if start falls inside any reservation)
      availability[date][court.id] = futureSlots.filter((slot) => {
        const slotMins = timeToMinutes(slot);
        return !courtRes.some((r) => {
          const rStart = timeToMinutes(r.start_time);
          const rEnd = rStart + r.duration_minutes;
          return slotMins >= rStart && slotMins < rEnd;
        });
      });
    }
  }

  return { availability, closedDates, openingMinsByDate, closingMinsByDate, blockedByDate };
}
