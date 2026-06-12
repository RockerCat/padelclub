#!/usr/bin/env npx tsx
/**
 * DEV-ONLY — Seed mock reservation history for alex-club-padel
 *
 * Usage:
 *   npm run seed:reservations                  — generate mock data
 *   npm run seed:reservations -- --clean       — clean existing + regenerate
 *   npm run seed:reservations -- --clean-only  — only remove mock data
 *
 * Requires:
 *   SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

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
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // No .env.local — rely on existing process env
  }
}

loadEnvFile();

// ─── Safety checks ────────────────────────────────────────────────────────────

if (
  process.env.NODE_ENV === "production" &&
  process.env.ALLOW_DEV_SEED !== "true"
) {
  console.error("❌  Abortado: no se puede ejecutar el seed en producción.");
  console.error("    Para forzarlo, agrega ALLOW_DEV_SEED=true al entorno.");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌  Faltan variables de entorno. Agrega a .env.local:");
  if (!SUPABASE_URL) console.error("    NEXT_PUBLIC_SUPABASE_URL=...");
  if (!SERVICE_ROLE_KEY)
    console.error("    SUPABASE_SERVICE_ROLE_KEY=...  (obtener en Supabase Dashboard → Project Settings → API)");
  process.exit(1);
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CLUB_SLUG      = "alex-club-padel";
const MOCK_NOTE      = "[MOCK_DATA] Reserva generada para estadísticas";
const DAYS_BACK      = 60;   // days of history to generate
const CANCELLED_RATE = 0.15; // 15 % of reservations end up cancelled
const BATCH_SIZE     = 100;  // rows per Supabase insert call

// How many reservations per court per day (index = count, value = weight)
// Results in avg ~2.4 reservations per court per open day
const COUNT_WEIGHTS_WEEKDAY  = [8,  20, 30, 28, 14]; // 0-4
const COUNT_WEIGHTS_SATURDAY = [4,  10, 22, 32, 32]; // more on Saturdays

// Slot granularity: every 30 min
const SLOT_STEP_MIN = 30;

const TYPES: Array<"match" | "class" | "block"> = [
  "match", "match", "match", "match", "match",
  "class", "class",
  "block",
];

const TITLES_BY_TYPE: Record<string, Array<string | null>> = {
  match: [null, null, null, "Liga interna", "Torneo sábado", "Amistoso", "Liga mixta"],
  class: ["Clínica principiantes", "Clase grupal", "Entrenamiento técnico", "Academia juvenil", null],
  block: ["Mantenimiento", "Reservado staff", "Evento del club", null],
};

// ─── Default operating hours (mirrors lib/operatingHours.ts) ─────────────────

type OH = { dayOfWeek: number; isOpen: boolean; opensAt: string | null; closesAt: string | null };

const DEFAULT_HOURS: OH[] = [
  { dayOfWeek: 0, isOpen: false, opensAt: null,    closesAt: null    }, // Dom
  { dayOfWeek: 1, isOpen: true,  opensAt: "06:00", closesAt: "22:00" }, // Lun
  { dayOfWeek: 2, isOpen: true,  opensAt: "06:00", closesAt: "22:00" }, // Mar
  { dayOfWeek: 3, isOpen: true,  opensAt: "06:00", closesAt: "22:00" }, // Mié
  { dayOfWeek: 4, isOpen: true,  opensAt: "06:00", closesAt: "22:00" }, // Jue
  { dayOfWeek: 5, isOpen: true,  opensAt: "06:00", closesAt: "22:00" }, // Vie
  { dayOfWeek: 6, isOpen: true,  opensAt: "08:00", closesAt: "18:00" }, // Sáb
];

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedRandom(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toMin(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
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

// All valid start times (every SLOT_STEP_MIN) where [start, start+duration] fits within hours.
// Snaps the open time UP to the nearest SLOT_STEP_MIN boundary so start times are always
// on :00 or :30, even if the club's configured opens_at is e.g. "06:10".
function candidateSlots(opensAt: string, closesAt: string, duration: number): number[] {
  const rawOpen = toMin(opensAt);
  const open    = Math.ceil(rawOpen / SLOT_STEP_MIN) * SLOT_STEP_MIN;
  const close   = toMin(closesAt);
  const slots: number[] = [];
  for (let m = open; m + duration <= close; m += SLOT_STEP_MIN) {
    slots.push(m);
  }
  return slots;
}

function overlaps(s1: number, e1: number, s2: number, e2: number): boolean {
  return s1 < e2 && e1 > s2;
}

// Decode the "role" claim from a Supabase JWT without external libs
function decodeJwtRole(token: string): string {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as Record<string, unknown>;
    return String(decoded.role ?? "unknown");
  } catch {
    return "invalid-jwt";
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args      = process.argv.slice(2);
  const doClean   = args.includes("--clean") || args.includes("--clean-only");
  const cleanOnly = args.includes("--clean-only");

  console.log("🎾  PadelClub — Mock Reservation Seed");
  console.log(`    Target club : ${CLUB_SLUG}`);
  console.log(`    Mode        : ${cleanOnly ? "clean only" : doClean ? "clean + generate" : "generate"}`);
  console.log("");

  // ─── Env diagnostics ────────────────────────────────────────────────────────
  console.log("🔍  Diagnóstico de entorno:");
  console.log(`    NEXT_PUBLIC_SUPABASE_URL     : ${SUPABASE_URL}`);
  const keyPreview = SERVICE_ROLE_KEY
    ? `✓ presente (${SERVICE_ROLE_KEY.length} chars, role="${decodeJwtRole(SERVICE_ROLE_KEY)}")`
    : "❌ ausente";
  console.log(`    SUPABASE_SERVICE_ROLE_KEY    : ${keyPreview}`);
  console.log("");

  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ─── Debug: list all visible clubs (verifies service-role bypasses RLS) ──────
  console.log("🔍  Listando todos los clubs visibles para esta key…");
  const { data: allClubs, error: allClubsErr } = await supabase
    .from("clubs")
    .select("id, name, slug, is_active");

  if (allClubsErr) {
    const code = allClubsErr.code;
    console.error(`❌  Error al consultar clubs`);
    console.error(`    message : ${allClubsErr.message}`);
    console.error(`    code    : ${code}`);
    console.error("");

    if (code === "42501") {
      // PostgreSQL insufficient_privilege — NOT an RLS issue.
      // The service_role JWT is valid but the service_role PG *database role*
      // is missing GRANT on the tables. This happens when custom migrations
      // created tables without the default Supabase grants.
      console.error("    ── Causa: GRANT faltante (code 42501 = insufficient_privilege) ──────");
      console.error("    La key ES service_role (JWT correcto), pero el rol de PostgreSQL");
      console.error("    'service_role' no tiene privilegios SELECT en la tabla clubs.");
      console.error("    Esto NO es RLS — es un GRANT de schema/table faltante.");
      console.error("");
      console.error("    ── Fix: ejecutar en Supabase → SQL Editor ───────────────────────────");
      console.error("    https://supabase.com/dashboard/project/rfzyqmvqmqsjigcvxxnf/sql/new");
      console.error("");
      console.error("    GRANT USAGE  ON SCHEMA public TO service_role;");
      console.error("    GRANT ALL    ON ALL TABLES    IN SCHEMA public TO service_role;");
      console.error("    GRANT ALL    ON ALL SEQUENCES IN SCHEMA public TO service_role;");
      console.error("    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;");
      console.error("");
      console.error("    ALTER DEFAULT PRIVILEGES IN SCHEMA public");
      console.error("      GRANT ALL ON TABLES    TO service_role;");
      console.error("    ALTER DEFAULT PRIVILEGES IN SCHEMA public");
      console.error("      GRANT ALL ON SEQUENCES TO service_role;");
    } else if (code === "PGRST301" || allClubsErr.message.includes("JWSError")) {
      console.error("    ── Causa: JWT inválido o expirado ───────────────────────────────────");
      console.error("    → Verificar que SUPABASE_SERVICE_ROLE_KEY sea la key vigente del proyecto.");
    } else {
      console.error("    ── Causa desconocida ────────────────────────────────────────────────");
      console.error("    → Revisar Supabase Dashboard → Logs → API.");
    }

    process.exit(1);
  }

  if (!allClubs || allClubs.length === 0) {
    console.error("❌  La consulta a clubs devolvió 0 filas.");
    console.error("    Esto indica que RLS está bloqueando el acceso, lo que significa que");
    console.error("    SUPABASE_SERVICE_ROLE_KEY contiene la clave 'anon' (no la 'service_role').");
    console.error("    → Supabase Dashboard → Project Settings → API → 'service_role' secret key");
    process.exit(1);
  }

  console.log(`    ${allClubs.length} club(s) encontrado(s):`);
  for (const c of allClubs) {
    const isTarget = c.slug === CLUB_SLUG ? " ◀ target" : "";
    console.log(`      slug="${c.slug}"  name="${c.name}"  active=${c.is_active}${isTarget}`);
  }
  console.log("");

  if (!allClubs.some((c) => c.slug === CLUB_SLUG)) {
    console.error(`❌  Ningún club tiene slug="${CLUB_SLUG}".`);
    console.error(`    Slugs disponibles: ${allClubs.map((c) => `"${c.slug}"`).join(", ")}`);
    process.exit(1);
  }

  // 1 — Fetch club
  const { data: club, error: clubErr } = await supabase
    .from("clubs")
    .select("id, name")
    .eq("slug", CLUB_SLUG)
    .single();

  if (clubErr || !club) {
    console.error(`❌  Club "${CLUB_SLUG}" no encontrado. Error: ${clubErr?.message}`);
    process.exit(1);
  }
  console.log(`✓  Club : ${club.name}  (${club.id})`);

  // 2 — Fetch active courts
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
  console.log(`✓  Canchas : ${courts.map((c) => c.name).join(", ")}`);

  // 3 — Fetch + merge operating hours
  const { data: dbHours } = await supabase
    .from("club_operating_hours")
    .select("day_of_week, is_open, opens_at, closes_at")
    .eq("club_id", club.id);

  const opHours: OH[] = DEFAULT_HOURS.map((def) => {
    const row = (dbHours ?? []).find((h) => h.day_of_week === def.dayOfWeek);
    if (!row) return def;
    return {
      dayOfWeek : row.day_of_week,
      isOpen    : row.is_open,
      opensAt   : row.opens_at,
      closesAt  : row.closes_at,
    };
  });

  const openDays = opHours.filter((h) => h.isOpen).map((h) => h.dayOfWeek);
  console.log(`✓  Horario : días abiertos → ${openDays.join(", ")} (0=Dom)`);

  // 4 — Fetch OWNER (for created_by / cancelled_by) + PLAYER members
  const [ownerRes, playersRes] = await Promise.all([
    supabase
      .from("club_members")
      .select("profile_id")
      .eq("club_id", club.id)
      .eq("role", "OWNER")
      .eq("is_active", true)
      .single(),
    supabase
      .from("club_members")
      .select("profile_id")
      .eq("club_id", club.id)
      .eq("role", "PLAYER")
      .eq("is_active", true),
  ]);

  if (!ownerRes.data) {
    console.error("❌  No se encontró OWNER activo para este club.");
    process.exit(1);
  }

  const ownerProfileId = ownerRes.data.profile_id;
  const playerIds      = (playersRes.data ?? []).map((m) => m.profile_id);

  console.log(`✓  Owner   : ${ownerProfileId}`);
  console.log(`✓  Players : ${playerIds.length} activos`);
  console.log("");

  // 5 — Clean if requested
  if (doClean) {
    process.stdout.write("🗑   Limpiando datos mock existentes…");

    const { data: mockRows } = await supabase
      .from("reservations")
      .select("id")
      .eq("club_id", club.id)
      .like("notes", `${MOCK_NOTE}%`);

    if (mockRows && mockRows.length > 0) {
      const ids = mockRows.map((r) => r.id);
      await supabase.from("reservation_players").delete().in("reservation_id", ids);
      await supabase.from("reservations").delete().in("id", ids);
      console.log(` eliminadas ${ids.length} reservas.`);
    } else {
      console.log(" ninguna encontrada.");
    }
    console.log("");

    if (cleanOnly) {
      console.log("✅  Listo (solo limpieza).");
      return;
    }
  }

  // 6 — Generate reservation + player rows
  console.log(`📅  Generando historial de ${DAYS_BACK} días…`);

  type ResRow = {
    id               : string;
    club_id          : string;
    court_id         : string;
    created_by       : string;
    date             : string;
    start_time       : string;
    duration_minutes : number;
    type             : "match" | "class" | "block";
    title            : string | null;
    notes            : string;
    status           : "confirmed" | "cancelled";
    cancelled_at     : string | null;
    cancelled_by     : string | null;
    created_at       : string;
  };

  type PlayerRow = { reservation_id: string; profile_id: string };

  const resRows: ResRow[]       = [];
  const playerRows: PlayerRow[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let daysAgo = DAYS_BACK; daysAgo >= 0; daysAgo--) {
    const date       = addDays(today, -daysAgo);
    const dateStr    = toDateStr(date);
    const dayOfWeek  = date.getDay(); // 0=Sun

    const sched = opHours.find((h) => h.dayOfWeek === dayOfWeek);
    if (!sched || !sched.isOpen || !sched.opensAt || !sched.closesAt) continue;

    const isSaturday   = dayOfWeek === 6;
    const countWeights = isSaturday ? COUNT_WEIGHTS_SATURDAY : COUNT_WEIGHTS_WEEKDAY;

    // occupied slots per court on this date: { start, end } in minutes
    const occupiedPerCourt = new Map<string, Array<{ start: number; end: number }>>();
    courts.forEach((c) => occupiedPerCourt.set(c.id, []));

    for (const court of courts) {
      const targetCount = weightedRandom(countWeights);
      if (targetCount === 0) continue;

      const occupied = occupiedPerCourt.get(court.id)!;

      // Build all candidate (start, duration) pairs, then shuffle
      const candidates = shuffle([
        ...candidateSlots(sched.opensAt, sched.closesAt, 60).map((s) => ({ s, d: 60 })),
        ...candidateSlots(sched.opensAt, sched.closesAt, 90).map((s) => ({ s, d: 90 })),
        // Prefer 60-min by repeating those candidates
        ...candidateSlots(sched.opensAt, sched.closesAt, 60).map((s) => ({ s, d: 60 })),
      ]);

      let placed = 0;

      for (const { s: startMin, d: duration } of candidates) {
        if (placed >= targetCount) break;

        const endMin = startMin + duration;
        if (occupied.some((o) => overlaps(startMin, endMin, o.start, o.end))) continue;

        occupied.push({ start: startMin, end: endMin });

        // Build the reservation
        const id          = randomUUID();
        const type        = pick(TYPES);
        const title       = pick(TITLES_BY_TYPE[type]);
        const isCancelled = Math.random() < CANCELLED_RATE;
        const status      = isCancelled ? "cancelled" : "confirmed";

        // created_at: between 1 h and 5 days before the reservation start
        const reservationTimestamp = new Date(date);
        reservationTimestamp.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
        const leadMs  = (Math.floor(Math.random() * 119) + 1) * 3600 * 1000; // 1–120 h
        const createdAt = new Date(reservationTimestamp.getTime() - leadMs);

        const cancelledAt = isCancelled
          ? new Date(
              createdAt.getTime() +
                Math.floor(Math.random() * 6 + 1) * 3600 * 1000
            ).toISOString()
          : null;

        resRows.push({
          id,
          club_id          : club.id,
          court_id         : court.id,
          created_by       : ownerProfileId,
          date             : dateStr,
          start_time       : toTimeStr(startMin),
          duration_minutes : duration,
          type,
          title,
          notes            : MOCK_NOTE,
          status,
          cancelled_at     : cancelledAt,
          cancelled_by     : isCancelled ? ownerProfileId : null,
          created_at       : createdAt.toISOString(),
        });

        // Players: 0–4, capped by available pool
        if (playerIds.length > 0) {
          const maxP        = Math.min(4, playerIds.length);
          const playerCount = Math.floor(Math.random() * (maxP + 1));
          for (const profileId of shuffle(playerIds).slice(0, playerCount)) {
            playerRows.push({ reservation_id: id, profile_id: profileId });
          }
        }

        placed++;
      }
    }
  }

  console.log(`    Registros a insertar: ${resRows.length} reservas, ${playerRows.length} jugadores`);
  console.log("");

  // 7 — Insert reservations in batches
  process.stdout.write("    Insertando reservas   ");
  let inserted = 0;
  for (let i = 0; i < resRows.length; i += BATCH_SIZE) {
    const batch = resRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("reservations").insert(batch);
    if (error) {
      console.error(`\n❌  Error en batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      process.exit(1);
    }
    inserted += batch.length;
    process.stdout.write(`\r    Insertando reservas   ${inserted}/${resRows.length}`);
  }
  console.log(`  ✓`);

  // 8 — Insert reservation_players in batches
  if (playerRows.length > 0) {
    process.stdout.write("    Vinculando jugadores  ");
    let linkedPlayers = 0;
    for (let i = 0; i < playerRows.length; i += BATCH_SIZE) {
      const batch = playerRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("reservation_players").insert(batch);
      if (error) {
        // Non-fatal: reservations already persisted
        console.warn(`\n⚠   reservation_players batch error: ${error.message}`);
        break;
      }
      linkedPlayers += batch.length;
      process.stdout.write(`\r    Vinculando jugadores  ${linkedPlayers}/${playerRows.length}`);
    }
    console.log(`  ✓`);
  }

  // 9 — Summary
  const confirmed  = resRows.filter((r) => r.status === "confirmed").length;
  const cancelled  = resRows.filter((r) => r.status === "cancelled").length;

  console.log("");
  console.log("✅  Seed completo");
  console.log("");
  console.log("    Resumen:");
  console.log(`    Total reservas  : ${resRows.length}`);
  console.log(`    ✓ Confirmadas   : ${confirmed}`);
  console.log(`    ✗ Canceladas    : ${cancelled}`);
  console.log(`    Jugadores link. : ${playerRows.length}`);
  console.log("");

  courts.forEach((court) => {
    const total  = resRows.filter((r) => r.court_id === court.id).length;
    const conf   = resRows.filter((r) => r.court_id === court.id && r.status === "confirmed").length;
    const canc   = resRows.filter((r) => r.court_id === court.id && r.status === "cancelled").length;
    console.log(`    ${court.name.padEnd(20)} ${total} reservas  (✓ ${conf}  ✗ ${canc})`);
  });

  console.log("");
  console.log("    Para limpiar y regenerar:");
  console.log("    npm run seed:reservations -- --clean");
}

main().catch((err: unknown) => {
  console.error("\n❌  Error inesperado:", err);
  process.exit(1);
});
