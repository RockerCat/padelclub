#!/usr/bin/env npx tsx
/**
 * DEV-ONLY — Seed realistic FUTURE mock reservations for a live demo.
 *
 * Generates reservations from today through +6 months, respecting the
 * club's real operating hours, allowed durations and the app's overlap
 * rule, with a non-uniform day/hour distribution so the calendar looks
 * like a real operating club rather than a uniform grid.
 *
 * Usage:
 *   npm run seed:future-demo                  — clean previous batch + generate
 *   npm run seed:future-demo -- --clean-only  — only remove the mock batch
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  DEFAULT_OPERATING_HOURS,
  getEffectiveHour,
  validateAgainstOperatingHours,
  timeToMinutes,
  type OperatingHour,
} from "../src/lib/operatingHours";
import { getClubDurations } from "../src/lib/durations";

// ─── Load .env.local ──────────────────────────────────────────────────────────

function loadEnvFile() {
  try {
    const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // No .env.local — rely on existing process env
  }
}

loadEnvFile();

if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_SEED !== "true") {
  console.error("❌  Abortado: no se puede ejecutar el seed en producción.");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌  Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CLUB_SLUG = "alex-club-padel";
const MOCK_TAG = "mock_batch=future_demo_6_months";
const TITLE_PREFIX = "[DEMO] ";
const BATCH_SIZE = 300;
const MONTHS_AHEAD = 6;

// Reservations table CHECK constraint (migration 20260611000007) allows
// (30,60,90,120) regardless of what a club's allowed_reservation_durations
// config says — intersect both so we never violate the DB constraint.
const DB_ALLOWED_DURATIONS = [30, 60, 90, 120];

// Day-bucket weights: [empty, low(1 court), normal(2 courts), busy(all courts)]
const BUCKET_WEIGHTS_WEEKDAY: [number, number, number, number] = [10, 22, 40, 28];
const BUCKET_WEIGHTS_SATURDAY: [number, number, number, number] = [5, 15, 38, 42];

// How many separate reservations a single active court gets in a single day
const COUNT_WEIGHTS = [35, 40, 18, 7]; // → counts 1,2,3,4

const TYPE_WEIGHTS: Array<["match" | "class", number]> = [["match", 83], ["class", 17]];
const DURATION_WEIGHTS: Record<number, number> = { 60: 50, 90: 35, 120: 15 };

const PEAK_RANGES: Array<[number, number]> = [[6 * 60, 8 * 60], [17 * 60, 22 * 60]];
const VALLEY_RANGE: [number, number] = [10 * 60, 15 * 60];
const MAINTENANCE_WINDOWS: Array<[number, number]> = [[6 * 60, 9 * 60], [10 * 60, 15 * 60]];

const MAINTENANCE_TARGET_RATIO = 0.04; // aim ~4%, hard cap 5%
const MAINTENANCE_MAX_RATIO = 0.05;

const MATCH_TITLES = ["Partido casual", "Reserva de cancha", "Partido ranking", "Partido amistoso", "Liga interna"];
const CLASS_TITLES = ["Clase principiante", "Entrenamiento 4ta", "Clínica técnica", "Clase privada"];
const BLOCK_TITLES = [
  "Mantenimiento de cancha", "Limpieza profunda", "Cambio de arena",
  "Revisión de iluminación", "Reparación de malla", "Limpieza de cancha", "Bloqueo administrativo",
];
const GENERAL_NOTES = ["Reserva creada para demo", "Confirmar asistencia", "Pago pendiente", "Traer bolas"];
const MAINTENANCE_NOTES = ["Mantenimiento preventivo", "Reserva creada para demo"];

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedIndex(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function weightedPick<T extends string | number>(entries: Array<[T, number]>): T {
  const idx = weightedIndex(entries.map((e) => e[1]));
  return entries[idx][0];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}

function toTimeStr(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function overlaps(s1: number, e1: number, s2: number, e2: number): boolean {
  return s1 < e2 && e1 > s2;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// PostgREST caps responses at its default page size (commonly 1000) —
// paginate with .range() so large result sets are never silently truncated.
// Takes a *factory* (not a built query) so every page starts from a fresh
// builder instead of re-awaiting an already-executed one.
async function fetchAllRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: () => any,
  pageSize = 1000
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(`fetchAllRows: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function hourWeight(startMin: number): number {
  if (PEAK_RANGES.some(([a, b]) => startMin >= a && startMin < b)) return 3;
  if (startMin >= VALLEY_RANGE[0] && startMin < VALLEY_RANGE[1]) return 1;
  return 2;
}

// Candidate (start,duration) pairs that fit inside [opensAt,closesAt), weighted by hour-of-day.
function buildWeightedCandidates(
  opensAt: string,
  closesAt: string,
  durations: number[],
  windows?: Array<[number, number]>
): Array<{ start: number; duration: number; weight: number }> {
  const open = timeToMinutes(opensAt);
  const close = timeToMinutes(closesAt);
  const out: Array<{ start: number; duration: number; weight: number }> = [];
  for (const duration of durations) {
    for (let start = open; start + duration <= close; start += 30) {
      if (windows && !windows.some(([a, b]) => start >= a && start < b)) continue;
      const w = windows ? 1 : hourWeight(start) * (DURATION_WEIGHTS[duration] ?? 10);
      out.push({ start, duration, weight: w });
    }
  }
  return out;
}

function pickWeightedSlot(
  candidates: Array<{ start: number; duration: number; weight: number }>,
  occupied: Array<{ start: number; end: number }>
): { start: number; duration: number } | null {
  const free = candidates.filter((c) => !occupied.some((o) => overlaps(c.start, c.start + c.duration, o.start, o.end)));
  if (free.length === 0) return null;
  const idx = weightedIndex(free.map((c) => c.weight));
  return free[idx];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type ResRow = {
  id: string;
  club_id: string;
  court_id: string;
  created_by: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  type: "match" | "class" | "block";
  title: string;
  notes: string;
  status: "confirmed";
};
type PlayerRow = { reservation_id: string; profile_id: string };

async function main() {
  const cleanOnly = process.argv.includes("--clean-only");

  console.log("🎾  PadelClub — Future Demo Reservation Seed");
  console.log(`    Club target : ${CLUB_SLUG}`);
  console.log(`    Mock tag    : ${MOCK_TAG}`);
  console.log("");

  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1 — Club
  const { data: club, error: clubErr } = await supabase
    .from("clubs")
    .select("id, name, allowed_reservation_durations")
    .eq("slug", CLUB_SLUG)
    .single();
  if (clubErr || !club) {
    console.error(`❌  Club "${CLUB_SLUG}" no encontrado: ${clubErr?.message}`);
    process.exit(1);
  }
  console.log(`✓  Club: ${club.name} (${club.id})`);

  // 2 — Active courts only
  const { data: courts } = await supabase
    .from("courts")
    .select("id, name")
    .eq("club_id", club.id)
    .eq("is_active", true)
    .order("sort_order");
  if (!courts || courts.length === 0) {
    console.error("❌  No hay canchas activas.");
    process.exit(1);
  }
  console.log(`✓  Canchas activas (${courts.length}): ${courts.map((c) => c.name).join(", ")}`);

  // 3 — Operating hours (merge with same defaults the app uses)
  const { data: dbHours } = await supabase
    .from("club_operating_hours")
    .select("day_of_week, is_open, opens_at, closes_at")
    .eq("club_id", club.id);
  const opHours: OperatingHour[] = DEFAULT_OPERATING_HOURS.map((def) => {
    const row = (dbHours ?? []).find((h) => h.day_of_week === def.day_of_week);
    return row
      ? { day_of_week: row.day_of_week, is_open: row.is_open, opens_at: row.opens_at, closes_at: row.closes_at }
      : def;
  });
  console.log(`✓  Horarios: ${opHours.map((h) => `${h.day_of_week}=${h.is_open ? `${h.opens_at?.slice(0,5)}-${h.closes_at?.slice(0,5)}` : "cerrado"}`).join(" | ")}`);

  // 4 — Durations: intersect club config with the DB CHECK constraint
  const clubDurations = getClubDurations(club.allowed_reservation_durations as number[] | null);
  const usableDurations = clubDurations.filter((d) => DB_ALLOWED_DURATIONS.includes(d));
  if (usableDurations.length === 0) {
    console.error("❌  Ninguna duración configurada es válida para la tabla reservations.");
    process.exit(1);
  }
  console.log(`✓  Duraciones usables: ${usableDurations.join(", ")} min`);

  // 5 — Members
  const { data: creatorRows } = await supabase
    .from("club_members")
    .select("profile_id")
    .eq("club_id", club.id)
    .eq("is_active", true)
    .in("role", ["OWNER", "ADMIN"]);
  const { data: playerRows } = await supabase
    .from("club_members")
    .select("profile_id")
    .eq("club_id", club.id)
    .eq("is_active", true)
    .eq("role", "PLAYER");

  const creatorIds = (creatorRows ?? []).map((m) => m.profile_id);
  const playerIds = (playerRows ?? []).map((m) => m.profile_id);
  if (creatorIds.length === 0) {
    console.error("❌  No hay OWNER/ADMIN activo para usar como created_by.");
    process.exit(1);
  }
  console.log(`✓  Creadores (OWNER/ADMIN): ${creatorIds.length}  |  Jugadores (PLAYER): ${playerIds.length}`);
  console.log("");

  // 6 — Date range: today through +6 months
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(today);
  rangeEnd.setMonth(rangeEnd.getMonth() + MONTHS_AHEAD);
  const todayStr = toDateStr(today);
  const rangeEndStr = toDateStr(rangeEnd);
  console.log(`📅  Rango: ${todayStr} → ${rangeEndStr}`);

  // 7 — Clean previous batch (idempotent re-run, scoped to this exact tag)
  // Paginated fetch + chunked delete — a single .in() with 500+ UUIDs can hit
  // PostgREST/URL length limits and fail silently if errors aren't checked.
  process.stdout.write("🗑   Limpiando batch mock anterior (si existe)…\n");
  const prevMockIds = (
    await fetchAllRows<{ id: string }>(() =>
      supabase.from("reservations").select("id").eq("club_id", club.id).like("notes", `%${MOCK_TAG}%`)
    )
  ).map((r) => r.id);

  if (prevMockIds.length > 0) {
    for (const idBatch of chunk(prevMockIds, 200)) {
      const { error: delPlayersErr } = await supabase
        .from("reservation_players")
        .delete()
        .in("reservation_id", idBatch);
      if (delPlayersErr) {
        console.error(`❌  Error borrando reservation_players: ${delPlayersErr.message}`);
        process.exit(1);
      }
      const { error: delResErr } = await supabase.from("reservations").delete().in("id", idBatch);
      if (delResErr) {
        console.error(`❌  Error borrando reservations: ${delResErr.message}`);
        process.exit(1);
      }
    }

    // Verify the delete actually landed — never trust an unchecked call count.
    const { count: remaining } = await supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("club_id", club.id)
      .like("notes", `%${MOCK_TAG}%`);
    if (remaining && remaining > 0) {
      console.error(`❌  Limpieza incompleta: quedan ${remaining} reservas mock tras el delete.`);
      process.exit(1);
    }
    console.log(`    eliminadas ${prevMockIds.length} reservas mock previas (verificado: 0 restantes).`);
  } else {
    console.log("    ninguna encontrada.");
  }
  if (cleanOnly) {
    console.log("✅  Listo (solo limpieza).");
    return;
  }
  console.log("");

  // 8 — Seed occupied map with existing (real) reservations in range
  const existing = await fetchAllRows<{ court_id: string; date: string; start_time: string; duration_minutes: number }>(
    () =>
      supabase
        .from("reservations")
        .select("court_id, date, start_time, duration_minutes")
        .eq("club_id", club.id)
        .gte("date", todayStr)
        .lte("date", rangeEndStr)
  );

  const occupied = new Map<string, Array<{ start: number; end: number }>>();
  const key = (courtId: string, date: string) => `${courtId}__${date}`;
  for (const r of existing) {
    const k = key(r.court_id, r.date);
    const start = timeToMinutes(r.start_time);
    if (!occupied.has(k)) occupied.set(k, []);
    occupied.get(k)!.push({ start, end: start + r.duration_minutes });
  }
  console.log(`✓  Reservas reales preexistentes en rango: ${existing.length} (preservadas, nunca tocadas)`);
  console.log("");

  // 9 — Generate match/class reservations day by day
  console.log("🎲  Generando reservas…");
  const resRows: ResRow[] = [];
  const playerLinkRows: PlayerRow[] = [];

  function buildTitleAndNotes(type: "match" | "class" | "block"): { title: string; notes: string } {
    const contentTitle =
      type === "match" ? pick(MATCH_TITLES) : type === "class" ? pick(CLASS_TITLES) : pick(BLOCK_TITLES);
    const noteChance = type === "block" ? 0.4 : 0.25;
    const humanNote = Math.random() < noteChance ? pick(type === "block" ? MAINTENANCE_NOTES : GENERAL_NOTES) : null;
    const notes = humanNote ? `${humanNote} (${MOCK_TAG})` : MOCK_TAG;
    return { title: `${TITLE_PREFIX}${contentTitle}`, notes };
  }

  function assignPlayers(reservationId: string, type: "match" | "class") {
    if (playerIds.length === 0) return;
    let weights: number[];
    if (type === "match") {
      weights = playerIds.length >= 2 ? [25, 35, 40] : [25, 75]; // [0,1,(2)]
    } else {
      weights = playerIds.length >= 1 ? [55, 45] : [100]; // [0,1]
    }
    const count = Math.min(weightedIndex(weights), playerIds.length);
    for (const profileId of sample(playerIds, count)) {
      playerLinkRows.push({ reservation_id: reservationId, profile_id: profileId });
    }
  }

  for (let cur = new Date(today); cur <= rangeEnd; cur = addDays(cur, 1)) {
    const dateStr = toDateStr(cur);
    const dayOfWeek = cur.getDay();
    const hours = getEffectiveHour(opHours, dayOfWeek);
    if (!hours.is_open || !hours.opens_at || !hours.closes_at) continue; // closed day

    const bucketWeights = dayOfWeek === 6 ? BUCKET_WEIGHTS_SATURDAY : BUCKET_WEIGHTS_WEEKDAY;
    const bucket = weightedIndex(bucketWeights); // 0=empty,1=low,2=normal,3=busy
    const courtCount = bucket === 0 ? 0 : bucket === 1 ? 1 : bucket === 2 ? 2 : courts.length;
    if (courtCount === 0) continue;

    const activeCourtsToday = sample(courts, courtCount);
    const candidates = buildWeightedCandidates(hours.opens_at, hours.closes_at, usableDurations);

    for (const court of activeCourtsToday) {
      const k = key(court.id, dateStr);
      if (!occupied.has(k)) occupied.set(k, []);
      const courtOccupied = occupied.get(k)!;

      const targetCount = weightedIndex(COUNT_WEIGHTS) + 1; // 1..4
      for (let i = 0; i < targetCount; i++) {
        const slot = pickWeightedSlot(candidates, courtOccupied);
        if (!slot) break;
        courtOccupied.push({ start: slot.start, end: slot.start + slot.duration });

        const id = randomUUID();
        const type = weightedPick(TYPE_WEIGHTS);
        const { title, notes } = buildTitleAndNotes(type);

        resRows.push({
          id,
          club_id: club.id,
          court_id: court.id,
          created_by: pick(creatorIds),
          date: dateStr,
          start_time: toTimeStr(slot.start),
          duration_minutes: slot.duration,
          type,
          title,
          notes,
          status: "confirmed",
        });

        assignPlayers(id, type);
      }
    }
  }

  console.log(`    Reservas operativas (match/class): ${resRows.length}`);

  // 10 — Maintenance pass: ~4% of total, capped at 5%, valley/morning hours only
  const maintenanceTarget = Math.min(
    Math.round((MAINTENANCE_TARGET_RATIO * resRows.length) / (1 - MAINTENANCE_TARGET_RATIO)),
    Math.floor((MAINTENANCE_MAX_RATIO * resRows.length) / (1 - MAINTENANCE_MAX_RATIO))
  );

  const allOpenDays: string[] = [];
  for (let cur = new Date(today); cur <= rangeEnd; cur = addDays(cur, 1)) {
    const hours = getEffectiveHour(opHours, cur.getDay());
    if (hours.is_open && hours.opens_at && hours.closes_at) allOpenDays.push(toDateStr(cur));
  }

  let placedMaintenance = 0;
  let attempts = 0;
  while (placedMaintenance < maintenanceTarget && attempts < maintenanceTarget * 20) {
    attempts++;
    const dateStr = pick(allOpenDays);
    const court = pick(courts);
    const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay();
    const hours = getEffectiveHour(opHours, dayOfWeek);
    if (!hours.opens_at || !hours.closes_at) continue;

    const candidates = buildWeightedCandidates(hours.opens_at, hours.closes_at, [60, 90], MAINTENANCE_WINDOWS)
      .filter((c) => usableDurations.includes(c.duration));
    if (candidates.length === 0) continue;

    const k = key(court.id, dateStr);
    if (!occupied.has(k)) occupied.set(k, []);
    const courtOccupied = occupied.get(k)!;
    const slot = pickWeightedSlot(candidates, courtOccupied);
    if (!slot) continue;

    courtOccupied.push({ start: slot.start, end: slot.start + slot.duration });
    const { title, notes } = buildTitleAndNotes("block");
    resRows.push({
      id: randomUUID(),
      club_id: club.id,
      court_id: court.id,
      created_by: pick(creatorIds),
      date: dateStr,
      start_time: toTimeStr(slot.start),
      duration_minutes: slot.duration,
      type: "block",
      title,
      notes,
      status: "confirmed",
    });
    placedMaintenance++;
  }
  console.log(`    Mantenimiento (block): ${placedMaintenance} (objetivo ${maintenanceTarget})`);
  console.log(`    Total a insertar: ${resRows.length} reservas, ${playerLinkRows.length} jugadores asignados`);
  console.log("");

  // 11 — Insert
  process.stdout.write("    Insertando reservas   ");
  for (let i = 0; i < resRows.length; i += BATCH_SIZE) {
    const batch = resRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("reservations").insert(batch);
    if (error) {
      console.error(`\n❌  Error en batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      process.exit(1);
    }
    process.stdout.write(`\r    Insertando reservas   ${Math.min(i + BATCH_SIZE, resRows.length)}/${resRows.length}`);
  }
  console.log("  ✓");

  if (playerLinkRows.length > 0) {
    process.stdout.write("    Vinculando jugadores  ");
    for (let i = 0; i < playerLinkRows.length; i += BATCH_SIZE) {
      const batch = playerLinkRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("reservation_players").insert(batch);
      if (error) {
        console.warn(`\n⚠   reservation_players batch error: ${error.message}`);
        break;
      }
      process.stdout.write(`\r    Vinculando jugadores  ${Math.min(i + BATCH_SIZE, playerLinkRows.length)}/${playerLinkRows.length}`);
    }
    console.log("  ✓");
  }
  console.log("");

  // 12 — Validation report (re-queries the live DB, not in-memory arrays)
  console.log("📊  Reporte de validación");
  console.log("");

  const mockRows = await fetchAllRows<{
    id: string; court_id: string; date: string; start_time: string; duration_minutes: number; type: string;
  }>(() =>
    supabase
      .from("reservations")
      .select("id, court_id, date, start_time, duration_minutes, type")
      .eq("club_id", club.id)
      .like("notes", `%${MOCK_TAG}%`)
  );

  const total = mockRows.length;
  const dates = mockRows.map((r) => r.date).sort();
  console.log(`    Total reservas mock creadas : ${total}`);
  console.log(`    Rango de fechas             : ${dates[0]} → ${dates[dates.length - 1]}`);
  console.log("");

  console.log("    Por cancha:");
  for (const court of courts) {
    const n = mockRows.filter((r) => r.court_id === court.id).length;
    console.log(`      ${court.name.padEnd(16)} ${n}`);
  }
  console.log("");

  console.log("    Por tipo:");
  for (const t of ["match", "class", "block"] as const) {
    const n = mockRows.filter((r) => r.type === t).length;
    console.log(`      ${t.padEnd(10)} ${n}  (${total > 0 ? ((n / total) * 100).toFixed(1) : 0}%)`);
  }
  console.log("");

  // Calendar-level day buckets (mock + preexisting, since that's what the demo calendar shows)
  const allInRange = await fetchAllRows<{ court_id: string; date: string; start_time: string; duration_minutes: number }>(
    () =>
      supabase
        .from("reservations")
        .select("court_id, date, start_time, duration_minutes")
        .eq("club_id", club.id)
        .gte("date", todayStr)
        .lte("date", rangeEndStr)
  );

  const byDay = new Map<string, Set<string>>();
  for (const r of allInRange) {
    if (!byDay.has(r.date)) byDay.set(r.date, new Set());
    byDay.get(r.date)!.add(r.court_id);
  }

  let emptyOpenDays = 0, oneCourtDays = 0, twoCourtDays = 0, busyDays = 0, closedDays = 0;
  for (let cur = new Date(today); cur <= rangeEnd; cur = addDays(cur, 1)) {
    const dateStr = toDateStr(cur);
    const hours = getEffectiveHour(opHours, cur.getDay());
    if (!hours.is_open) { closedDays++; continue; }
    const used = byDay.get(dateStr)?.size ?? 0;
    if (used === 0) emptyOpenDays++;
    else if (used === 1) oneCourtDays++;
    else if (used === 2) twoCourtDays++;
    else busyDays++;
  }
  console.log("    Distribución de días (calendario completo, incl. preexistentes):");
  console.log(`      Cerrados (config. club)   : ${closedDays}`);
  console.log(`      Abiertos sin reservas     : ${emptyOpenDays}`);
  console.log(`      Con 1 cancha usada        : ${oneCourtDays}`);
  console.log(`      Con 2 canchas usadas      : ${twoCourtDays}`);
  console.log(`      Con ${courts.length} (todas) canchas usadas : ${busyDays}`);
  console.log("");

  // Overlap check across mock + preexisting
  let overlapViolations = 0;
  const byCourtDate = new Map<string, Array<{ start: number; end: number }>>();
  for (const r of allInRange) {
    const k = key(r.court_id, r.date);
    const start = timeToMinutes(r.start_time);
    if (!byCourtDate.has(k)) byCourtDate.set(k, []);
    byCourtDate.get(k)!.push({ start, end: start + r.duration_minutes });
  }
  for (const intervals of byCourtDate.values()) {
    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < sorted[i - 1].end) overlapViolations++;
    }
  }
  console.log(`    Solapamientos por cancha    : ${overlapViolations === 0 ? "✓ ninguno" : `❌ ${overlapViolations} encontrados`}`);

  // Operating-hours check for mock rows only
  let hoursViolations = 0;
  for (const r of mockRows) {
    const dow = new Date(`${r.date}T00:00:00`).getDay();
    const hours = getEffectiveHour(opHours, dow);
    const err = validateAgainstOperatingHours(hours, r.start_time, r.duration_minutes);
    if (err) hoursViolations++;
  }
  console.log(`    Fuera de horario operación  : ${hoursViolations === 0 ? "✓ ninguna" : `❌ ${hoursViolations} encontradas`}`);
  console.log("");
  console.log("✅  Seed completo. Para limpiar: npm run seed:future-demo -- --clean-only");
}

main().catch((err: unknown) => {
  console.error("\n❌  Error inesperado:", err);
  process.exit(1);
});
