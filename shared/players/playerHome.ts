// "Mi Pádel" — reglas puras de agregación multiclub del dashboard global del
// jugador. Sin Supabase ni React: la composición de datos vive en
// src/app/(player)/mi-padel/loadPlayerHome.ts y reutiliza exactamente las
// funciones del dashboard deportivo por club (shared/players/
// playerDashboard.ts) — aquí solo se decide qué se puede SUMAR entre clubes
// y qué debe quedarse desglosado por club.
//
// Regla fundamental (CLAUDE.md → Player Home Principles):
//   - Se suman (con deduplicación por id): torneos jugados/ganados, podios,
//     horas jugadas (reservas confirmadas ya terminadas) — misma semántica
//     en todo club.
//   - Nunca se suman: puntos, categorías, posiciones de ranking ni series de
//     evolución de puntos — cada club tiene su propio ranking y su propio
//     ledger; se presentan siempre por club.
//   - Los partidos abiertos (Encuentra tu partido) nunca aportan puntos,
//     resultados ni horas verificadas: solo aparecen como actividad.

import type {
  ClubReservationRecord,
  PlayerAchievement,
  PlayerSportEvolutionPoint,
} from "./playerDashboard";
import { isReservationFinished } from "./playerDashboard";

export const ALL_CLUBS = "all";
export type ClubFilter = typeof ALL_CLUBS | string;

export interface ClubSportSnapshot {
  clubId: string;
  clubSlug: string;
  clubName: string;
  clubLogoUrl: string | null;
  archived: boolean;
  category: string | null;
  currentPoints: number;
  rankingPosition: number | null;
  rankingTotal: number;
  trend: { delta: number; direction: "up" | "down" } | null;
  evolution: PlayerSportEvolutionPoint[];
  tournaments: { torneosJugados: number; torneosGanados: number; podios: number };
  /** Ids de reservas confirmadas ya terminadas + su duración: base de horas. */
  playedReservations: Array<{ id: string; date: string; minutes: number }>;
  achievements: PlayerAchievement[];
}

export function filterClubs<T extends { clubId: string }>(clubs: T[], filter: ClubFilter): T[] {
  return filter === ALL_CLUBS ? clubs : clubs.filter((c) => c.clubId === filter);
}

// ─── Horas jugadas ───────────────────────────────────────────────────────

/** Reservas confirmadas cuyo horario ya terminó — la misma regla que
 *  computePlayedHours del dashboard por club. */
export function toPlayedReservations(
  reservations: ClubReservationRecord[],
  now: Date = new Date()
): ClubSportSnapshot["playedReservations"] {
  return reservations
    .filter((r) => r.status === "confirmed" && isReservationFinished(r, now))
    .map((r) => ({ id: r.id, date: r.date, minutes: r.duration_minutes }));
}

function roundHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

// ─── Resumen deportivo (agregable) ───────────────────────────────────────

export interface AggregatedSportSummary {
  torneosJugados: number;
  torneosGanados: number;
  podios: number;
  playedHours: number;
  clubCount: number;
}

export function aggregateSportSummary(clubs: ClubSportSnapshot[], filter: ClubFilter): AggregatedSportSummary {
  const selected = filterClubs(clubs, filter);
  // Deduplicación defensiva por id de reserva: una reserva pertenece a un
  // solo club, pero nunca se cuenta dos veces aunque llegue repetida.
  const seen = new Set<string>();
  let minutes = 0;
  for (const club of selected) {
    for (const r of club.playedReservations) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      minutes += r.minutes;
    }
  }
  return {
    torneosJugados: selected.reduce((s, c) => s + c.tournaments.torneosJugados, 0),
    torneosGanados: selected.reduce((s, c) => s + c.tournaments.torneosGanados, 0),
    podios: selected.reduce((s, c) => s + c.tournaments.podios, 0),
    playedHours: roundHours(minutes),
    clubCount: selected.length,
  };
}

// ─── Evolución agregable: horas jugadas por mes ──────────────────────────

export interface MonthlyHoursPoint {
  month: string; // YYYY-MM
  hours: number;
}

/** Últimos `months` meses calendario (incluido el actual, `todayStr` en
 *  Bogotá), sumando horas jugadas de los clubes seleccionados. */
export function monthlyPlayedHours(
  clubs: ClubSportSnapshot[],
  filter: ClubFilter,
  todayStr: string,
  months = 6
): MonthlyHoursPoint[] {
  const [y, m] = todayStr.split("-").map(Number);
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const minutesByMonth = new Map(keys.map((k) => [k, 0]));
  const seen = new Set<string>();
  for (const club of filterClubs(clubs, filter)) {
    for (const r of club.playedReservations) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      const key = r.date.slice(0, 7);
      if (minutesByMonth.has(key)) minutesByMonth.set(key, minutesByMonth.get(key)! + r.minutes);
    }
  }
  return keys.map((k) => ({ month: k, hours: roundHours(minutesByMonth.get(k)!) }));
}

// ─── Logros (por club, con origen) ───────────────────────────────────────

export interface ClubAchievement extends PlayerAchievement {
  clubId: string;
  clubName: string;
}

export function collectAchievements(clubs: ClubSportSnapshot[], filter: ClubFilter): ClubAchievement[] {
  return filterClubs(clubs, filter).flatMap((c) =>
    c.achievements.map((a) => ({ ...a, clubId: c.clubId, clubName: c.clubName }))
  );
}

// ─── Próxima actividad (combinada, sin duplicados) ───────────────────────

export type UpcomingKind = "open_match" | "booking" | "request" | "tournament";

export interface UpcomingItem {
  /** Clave estable para deduplicar: tipo + id del origen. */
  key: string;
  kind: UpcomingKind;
  date: string; // YYYY-MM-DD (Bogotá)
  time: string | null; // HH:mm
  title: string;
  origin: string; // nombre del club o "Partido abierto"
  status: string;
  href: string;
  needsAction: boolean;
}

/** Une actividades de distintos orígenes: deduplica por clave, pone primero
 *  las que requieren una acción del jugador y luego las más próximas. */
export function mergeUpcoming(items: UpcomingItem[], limit = 5): UpcomingItem[] {
  const byKey = new Map<string, UpcomingItem>();
  for (const item of items) if (!byKey.has(item.key)) byKey.set(item.key, item);
  return [...byKey.values()]
    .sort((a, b) => {
      if (a.needsAction !== b.needsAction) return a.needsAction ? -1 : 1;
      return `${a.date} ${a.time ?? "99:99"}`.localeCompare(`${b.date} ${b.time ?? "99:99"}`);
    })
    .slice(0, limit);
}

// ─── Ciudad de referencia para "Oportunidades para jugar" ────────────────

export interface PreferredCity {
  city: string;
  source: "matches" | "clubs";
}

/** Nunca una ubicación inferida: primero la ciudad del partido abierto más
 *  reciente del jugador, luego la ciudad registrada de sus clubes (la más
 *  frecuente). Sin ninguna, null — la UI muestra partidos de todas las
 *  ciudades y lo dice. */
export function pickPreferredCity(
  myMatchCities: string[],
  clubCities: Array<string | null>
): PreferredCity | null {
  const fromMatch = myMatchCities.find((c) => c && c.trim());
  if (fromMatch) return { city: fromMatch.trim(), source: "matches" };
  const counts = new Map<string, number>();
  for (const c of clubCities) {
    const v = c?.trim();
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? { city: best[0], source: "clubs" } : null;
}
