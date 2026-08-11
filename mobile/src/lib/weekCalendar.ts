import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { DEFAULT_OPERATING_HOURS, type OperatingHour } from "./operatingHours";

// Tipos portados 1:1 de WeekCalendar.tsx (app web).
export type WeekDay = { date: string; dayName: string; dayNum: number; monthName: string };
export type CalendarCourt = { id: string; name: string; colorIndex: number };
export type CalendarReservation = {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  type: string;
  title: string | null;
  court_id: string;
  courtName: string;
  players: string[];
  created_by: string;
};

type RawRow = {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  type: string;
  title: string | null;
  court_id: string;
  created_by: string;
  courts: { name: string } | null;
  reservation_players: Array<{ profiles: { full_name: string | null } | null }>;
};

// Portado de las queries de la sección "Semana" en
// src/app/(app)/[club]/admin/reservations/page.tsx (app web) — mismo
// select, mismo status='confirmed', mismo rango Lunes-Domingo de la
// semana visible.
export async function getWeekCalendarData(
  supabase: SupabaseClient<Database>,
  clubId: string,
  mondayStr: string,
  sundayStr: string
): Promise<{ courts: CalendarCourt[]; reservations: CalendarReservation[]; closedDays: number[] }> {
  await supabase.rpc("expire_pending_reservations", { p_club_id: clubId });

  const [courtsRes, reservationsRes, hoursRes] = await Promise.all([
    supabase.from("courts").select("id, name, sort_order").eq("club_id", clubId).eq("is_active", true).order("sort_order", { ascending: true }),
    supabase
      .from("reservations")
      .select("id, date, start_time, duration_minutes, type, title, court_id, created_by, courts(name), reservation_players(profiles(full_name))")
      .eq("club_id", clubId)
      .eq("status", "confirmed")
      .gte("date", mondayStr)
      .lte("date", sundayStr),
    supabase.from("club_operating_hours").select("day_of_week, is_open, opens_at, closes_at").eq("club_id", clubId),
  ]);

  const rawCourts = courtsRes.data ?? [];
  const courts: CalendarCourt[] = rawCourts.map((c, i) => ({ id: c.id, name: c.name, colorIndex: i }));

  const rawRows = (reservationsRes.data ?? []) as unknown as RawRow[];
  const reservations: CalendarReservation[] = rawRows.map((r) => ({
    id: r.id,
    date: r.date,
    start_time: r.start_time,
    duration_minutes: r.duration_minutes,
    type: r.type,
    title: r.title,
    court_id: r.court_id,
    courtName: r.courts?.name ?? "—",
    players: r.reservation_players.map((rp) => rp.profiles?.full_name).filter((n): n is string => !!n),
    created_by: r.created_by,
  }));

  const dbHours = (hoursRes.data ?? []) as OperatingHour[];
  const closedDays = DEFAULT_OPERATING_HOURS.map((def) => dbHours.find((h) => h.day_of_week === def.day_of_week) ?? def)
    .filter((h) => !h.is_open)
    .map((h) => h.day_of_week);

  return { courts, reservations, closedDays };
}
