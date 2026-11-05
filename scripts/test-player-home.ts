// QA — "Mi Pádel" (dashboard global del jugador).
//
// 1. Reglas puras de agregación multiclub (shared/players/playerHome.ts):
//    qué se suma, qué se desglosa, deduplicación, filtros por club.
// 2. Regla de entrada post-login (resolveClubEntryPath) con un cliente
//    Supabase falso en memoria — nunca contra la base real.
//
//   npm run test:player-home

import {
  ALL_CLUBS,
  aggregateSportSummary,
  collectAchievements,
  mergeUpcoming,
  monthlyPlayedHours,
  pickPreferredCity,
  toPlayedReservations,
  type ClubSportSnapshot,
  type UpcomingItem,
} from "../shared/players/playerHome";
import { resolveClubEntryPath } from "../src/lib/utils/navigation";

let passed = 0;
let failed = 0;
function eq<T>(actual: T, expected: T, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log(`OK   ${label}`);
  } else {
    failed++;
    console.log(`FAIL ${label}\n     esperado: ${JSON.stringify(expected)}\n     obtenido: ${JSON.stringify(actual)}`);
  }
}

function club(id: string, over: Partial<ClubSportSnapshot> = {}): ClubSportSnapshot {
  return {
    clubId: id, clubSlug: id, clubName: `Club ${id}`, clubLogoUrl: null, archived: false,
    category: "6a", currentPoints: 100, rankingPosition: 2, rankingTotal: 10, trend: null, evolution: [],
    tournaments: { torneosJugados: 1, torneosGanados: 0, podios: 1 },
    playedReservations: [], achievements: [], ...over,
  };
}

// ─── Horas: misma regla que computePlayedHours ──────────────────────────
const now = new Date("2026-11-05T12:00:00");
const played = toPlayedReservations(
  [
    { id: "r1", date: "2026-11-01", start_time: "10:00", duration_minutes: 90, type: "match", status: "confirmed", created_by: "u", created_at: "", updated_at: "" },
    { id: "r2", date: "2026-11-02", start_time: "10:00", duration_minutes: 60, type: "match", status: "cancelled", created_by: "u", created_at: "", updated_at: "" },
    { id: "r3", date: "2026-12-01", start_time: "10:00", duration_minutes: 60, type: "match", status: "confirmed", created_by: "u", created_at: "", updated_at: "" },
  ],
  now
);
eq(played.map((r) => r.id), ["r1"], "solo confirmadas ya terminadas cuentan como horas");

// ─── Resumen: suma lo agregable, deduplica ──────────────────────────────
const a = club("a", {
  tournaments: { torneosJugados: 3, torneosGanados: 1, podios: 2 },
  playedReservations: [{ id: "x1", date: "2026-11-01", minutes: 90 }, { id: "x2", date: "2026-10-10", minutes: 60 }],
  achievements: [{ id: "first-podium", label: "Primer podio" }],
  currentPoints: 500, rankingPosition: 1,
});
const b = club("b", {
  tournaments: { torneosJugados: 2, torneosGanados: 0, podios: 1 },
  playedReservations: [{ id: "x1", date: "2026-11-01", minutes: 90 }, { id: "y1", date: "2026-09-05", minutes: 120 }],
  achievements: [{ id: "first-podium", label: "Primer podio" }, { id: "top-3", label: "Top 3 del ranking" }],
  currentPoints: 40, rankingPosition: 7,
});
eq(aggregateSportSummary([a, b], ALL_CLUBS), { torneosJugados: 5, torneosGanados: 1, podios: 3, playedHours: 4.5, clubCount: 2 },
  "todos: torneos/podios suman, horas sin duplicar la misma reserva");
eq(aggregateSportSummary([a, b], "b").torneosJugados, 2, "filtro por club conserva su propio valor");
eq(aggregateSportSummary([a, b], "b").playedHours, 3.5, "horas de un solo club");
eq(aggregateSportSummary([], ALL_CLUBS), { torneosJugados: 0, torneosGanados: 0, podios: 0, playedHours: 0, clubCount: 0 }, "sin clubes → ceros");
eq(Object.keys(aggregateSportSummary([a, b], ALL_CLUBS)).some((k) => /point|rank|categor/i.test(k)), false,
  "el resumen agregado nunca suma puntos, posiciones ni categorías");

// ─── Evolución agregable (horas por mes) ────────────────────────────────
eq(monthlyPlayedHours([a, b], ALL_CLUBS, "2026-11-05", 3), [
  { month: "2026-09", hours: 2 }, { month: "2026-10", hours: 1 }, { month: "2026-11", hours: 1.5 },
], "horas por mes, 3 meses, deduplicadas");
eq(monthlyPlayedHours([a], ALL_CLUBS, "2026-01-15", 2).map((p) => p.month), ["2025-12", "2026-01"], "meses cruzando año");
eq(monthlyPlayedHours([a, b], "a", "2026-11-05", 3).map((p) => p.hours), [0, 1, 1.5], "filtro por club en la serie");

// ─── Logros con club de origen ──────────────────────────────────────────
eq(collectAchievements([a, b], ALL_CLUBS).map((x) => `${x.clubName}:${x.id}`),
  ["Club a:first-podium", "Club b:first-podium", "Club b:top-3"], "logros de todos los clubes, cada uno con su origen");
eq(collectAchievements([a, b], "a").length, 1, "logros filtrados por club");

// ─── Próxima actividad ──────────────────────────────────────────────────
const item = (key: string, date: string, time: string | null, needsAction = false): UpcomingItem => ({
  key, kind: "booking", date, time, title: key, origin: "o", status: "s", href: "/", needsAction,
});
eq(mergeUpcoming([
  item("reservation:1", "2026-11-08", "10:00"),
  item("open_match:2", "2026-11-06", "19:00"),
  item("reservation:1", "2026-11-08", "10:00"),
  item("open_match:3", "2026-11-20", "08:00", true),
  item("tournament:4", "2026-11-07", null),
]).map((i) => i.key), ["open_match:3", "open_match:2", "tournament:4", "reservation:1"],
  "acción pendiente primero, luego cronológico, sin duplicados");
eq(mergeUpcoming([item("a", "2026-11-06", "10:00"), item("b", "2026-11-06", "09:00")], 1).map((i) => i.key), ["b"], "límite respetado");

// ─── Ciudad de referencia ───────────────────────────────────────────────
eq(pickPreferredCity(["Cali"], ["Bogotá"]), { city: "Cali", source: "matches" }, "prioriza la ciudad de sus partidos");
eq(pickPreferredCity([], ["Medellín", null, "Bogotá", "Bogotá"]), { city: "Bogotá", source: "clubs" }, "si no, la ciudad más frecuente de sus clubes");
eq(pickPreferredCity([], [null, " "]), null, "sin datos reales → null (nunca inventa ubicación)");

// ─── Entrada post-login (cliente falso) ─────────────────────────────────
type Row = { role: string; clubs: { id: string; slug: string; archived_at: string | null; is_active: boolean } };
function fakeClient(rows: Row[], profile: { account_type: string | null; last_club_id: string | null }) {
  const chain = {
    select: () => chain, eq: () => chain,
    order: () => Promise.resolve({ data: rows, error: null }),
  };
  return {
    from: () => chain,
    rpc: () => Promise.resolve({ data: [profile], error: null }),
  } as unknown as Parameters<typeof resolveClubEntryPath>[0];
}
const clubRow = (role: string, slug: string, extra: Partial<Row["clubs"]> = {}): Row => ({
  role, clubs: { id: slug, slug, archived_at: null, is_active: true, ...extra },
});

async function entryTests() {
  eq(await resolveClubEntryPath(fakeClient([], { account_type: null, last_club_id: null }), "u"), "/mi-padel", "cuenta nueva sin clubes → Mi Pádel");
  eq(await resolveClubEntryPath(fakeClient([], { account_type: "PLAYER", last_club_id: null }), "u"), "/mi-padel", "jugador sin clubes → Mi Pádel");
  eq(await resolveClubEntryPath(fakeClient([clubRow("PLAYER", "a")], { account_type: "PLAYER", last_club_id: null }), "u"), "/mi-padel", "jugador con un club → Mi Pádel");
  eq(await resolveClubEntryPath(fakeClient([clubRow("PLAYER", "a"), clubRow("PLAYER", "b")], { account_type: "PLAYER", last_club_id: "b" }), "u"), "/mi-padel", "jugador con varios clubes → Mi Pádel (aunque tenga último club)");
  eq(await resolveClubEntryPath(fakeClient([clubRow("OWNER", "a")], { account_type: "OWNER", last_club_id: null }), "u"), "/a/dashboard", "OWNER con un club → su dashboard (sin cambios)");
  eq(await resolveClubEntryPath(fakeClient([clubRow("ADMIN", "a")], { account_type: "ADMIN", last_club_id: null }), "u"), "/a/admin/reservations", "ADMIN → reservaciones (sin cambios)");
  eq(await resolveClubEntryPath(fakeClient([clubRow("OWNER", "a"), clubRow("OWNER", "b")], { account_type: "OWNER", last_club_id: "b" }), "u"), "/b/dashboard", "OWNER multiclub → último club (sin cambios)");
  eq(await resolveClubEntryPath(fakeClient([clubRow("OWNER", "a", { is_active: false })], { account_type: "OWNER", last_club_id: null }), "u"), "/clubs", "OWNER con club desactivado → /clubs (sin cambios)");
  eq(await resolveClubEntryPath(fakeClient([], { account_type: "ADMIN", last_club_id: null }), "u"), "/clubs", "ADMIN sin membresías activas → /clubs (sin cambios)");
}

entryTests().then(() => {
  console.log(`\n${passed} OK, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
});
