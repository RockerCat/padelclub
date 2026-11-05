import { mapOpenMatchVenue, type OpenMatchVenue } from "../directory/venues";

// Encuentra tu partido — lógica pura compartida (tipos, niveles, formato,
// mensaje de WhatsApp, errores). Sin dependencias de Next.js ni de React,
// para que una futura versión móvil la reutilice tal cual (ver CLAUDE.md →
// Shared View & Data Patterns). La autoridad real de cada regla vive en SQL
// (20261116000001_open_matches.sql); lo de aquí es presentación y
// validación de cortesía.

export const OPEN_MATCH_MAX_PLAYERS = 4;
export const OPEN_MATCH_MAX_DAYS_AHEAD = 60;
export const OPEN_MATCH_COMMENT_MAX = 280;
export const OPEN_MATCH_VENUE_MAX = 120;

export const OPEN_MATCH_LEVELS = [
  { value: "cualquiera", label: "Cualquier nivel" },
  { value: "iniciacion", label: "Iniciación" },
  { value: "7a", label: "7ª categoría" },
  { value: "6a", label: "6ª categoría" },
  { value: "5a", label: "5ª categoría" },
  { value: "4a", label: "4ª categoría" },
  { value: "3a", label: "3ª categoría" },
  { value: "2a", label: "2ª categoría" },
  { value: "1a", label: "1ª categoría" },
] as const;

export type OpenMatchLevel = (typeof OPEN_MATCH_LEVELS)[number]["value"];

export function isOpenMatchLevel(value: unknown): value is OpenMatchLevel {
  return OPEN_MATCH_LEVELS.some((l) => l.value === value);
}

export function openMatchLevelLabel(level: string): string {
  return OPEN_MATCH_LEVELS.find((l) => l.value === level)?.label ?? level;
}

// open      → con cupos libres
// full      → 4/4 (participantes + invitados)
// finished  → la fecha/hora ya pasó (America/Bogota)
// cancelled → cancelado por el organizador
export type OpenMatchPhase = "open" | "full" | "finished" | "cancelled";
export type OpenMatchCourtStatus = "pending" | "booked";

export interface OpenMatchParticipant {
  displayName: string;
  avatarUrl: string | null;
  isOrganizer: boolean;
  isViewer: boolean;
  needsReconfirm: boolean;
}

export interface OpenMatch {
  id: string;
  city: string;
  matchDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  level: string;
  maxPlayers: number;
  guestCount: number;
  taken: number;
  spotsLeft: number;
  venueName: string | null;
  /** Establecimiento del directorio elegido (opcional). Nunca implica cancha reservada. */
  venue: OpenMatchVenue | null;
  courtStatus: OpenMatchCourtStatus;
  comment: string | null;
  phase: OpenMatchPhase;
  scheduleVersion: number;
  scheduleChangedAt: string | null;
  organizerName: string;
  viewerIsOrganizer: boolean;
  viewerIsParticipant: boolean;
  viewerNeedsReconfirm: boolean;
  /** Solo en el detalle (get_open_match y respuestas de mutaciones). */
  participants: OpenMatchParticipant[] | null;
}

export interface OpenMatchCity {
  city: string;
  count: number;
}

type Row = Record<string, unknown>;

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : v == null ? fallback : String(v));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));
const nullableStr = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export function mapOpenMatch(raw: unknown): OpenMatch | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Row;
  const participants = Array.isArray(r.participants)
    ? (r.participants as Row[]).map((p) => ({
        displayName: str(p.display_name, "Jugador"),
        avatarUrl: nullableStr(p.avatar_url),
        isOrganizer: p.is_organizer === true,
        isViewer: p.is_viewer === true,
        needsReconfirm: p.needs_reconfirm === true,
      }))
    : null;
  const phase = str(r.phase);
  return {
    id: str(r.id),
    city: str(r.city),
    matchDate: str(r.match_date),
    startTime: str(r.start_time).slice(0, 5),
    level: str(r.level),
    maxPlayers: num(r.max_players) || OPEN_MATCH_MAX_PLAYERS,
    guestCount: num(r.guest_count),
    taken: num(r.taken),
    spotsLeft: num(r.spots_left),
    venueName: nullableStr(r.venue_name),
    venue: mapOpenMatchVenue(r.venue),
    courtStatus: r.court_status === "booked" ? "booked" : "pending",
    comment: nullableStr(r.comment),
    phase: (["open", "full", "finished", "cancelled"].includes(phase) ? phase : "open") as OpenMatchPhase,
    scheduleVersion: num(r.schedule_version) || 1,
    scheduleChangedAt: nullableStr(r.schedule_changed_at),
    organizerName: str(r.organizer_name, "Jugador"),
    viewerIsOrganizer: r.viewer_is_organizer === true,
    viewerIsParticipant: r.viewer_is_participant === true,
    viewerNeedsReconfirm: r.viewer_needs_reconfirm === true,
    participants,
  };
}

export function mapOpenMatchList(raw: unknown): OpenMatch[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(mapOpenMatch).filter((m): m is OpenMatch => m !== null);
}

export function mapOpenMatchCities(raw: unknown): OpenMatchCity[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Row[]).map((c) => ({ city: str(c.city), count: num(c.count) })).filter((c) => c.city);
}

// ─── Formato ────────────────────────────────────────────────────────────

const WEEKDAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const WEEKDAY_FULL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTH_FULL = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Fecha civil pura (YYYY-MM-DD) — nunca pasa por la zona horaria del
// proceso: getUTCDay sobre un Date construido en UTC.
function civil(date: string): { y: number; m: number; d: number; wd: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

function addDays(date: string, days: number): string {
  const c = civil(date);
  if (!c) return date;
  const dt = new Date(Date.UTC(c.y, c.m - 1, c.d + days));
  return dt.toISOString().slice(0, 10);
}

/** "Hoy", "Mañana" o "sáb 14 nov", relativo a `today` (YYYY-MM-DD en Bogotá). */
export function formatOpenMatchDay(date: string, today?: string): string {
  if (today) {
    if (date === today) return "Hoy";
    if (date === addDays(today, 1)) return "Mañana";
  }
  const c = civil(date);
  if (!c) return date;
  return `${WEEKDAY_SHORT[c.wd]} ${c.d} ${MONTH_SHORT[c.m - 1]}`;
}

/** "sábado 14 de noviembre" */
export function formatOpenMatchDayLong(date: string): string {
  const c = civil(date);
  if (!c) return date;
  return `${WEEKDAY_FULL[c.wd]} ${c.d} de ${MONTH_FULL[c.m - 1]}`;
}

/** "7:30 p. m." */
export function formatOpenMatchTime(time: string): string {
  const [hStr, mStr = "00"] = time.split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return time;
  const suffix = h < 12 ? "a. m." : "p. m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr.padStart(2, "0").slice(0, 2)} ${suffix}`;
}

export function formatSpotsLeft(spotsLeft: number): string {
  if (spotsLeft <= 0) return "Completo";
  return spotsLeft === 1 ? "Falta 1 jugador" : `Faltan ${spotsLeft} jugadores`;
}

export function openMatchPhaseLabel(phase: OpenMatchPhase): string {
  switch (phase) {
    case "open": return "Buscando jugadores";
    case "full": return "Completo";
    case "finished": return "Finalizado";
    case "cancelled": return "Cancelado";
  }
}

export function openMatchCourtLabel(status: OpenMatchCourtStatus): string {
  return status === "booked" ? "Cancha reservada" : "Cancha por confirmar";
}

/** Ruta pública canónica del detalle. */
/** Lugar a mostrar: el establecimiento del directorio, o el texto libre. */
export function openMatchPlaceName(match: Pick<OpenMatch, "venue" | "venueName">): string | null {
  return match.venue?.name ?? match.venueName ?? null;
}

export function openMatchPath(id: string): string {
  return `/partidos/${id}`;
}

// Mensaje breve y natural para WhatsApp. Se devuelve como string Unicode
// normal — quien arme el enlace lo codifica UNA sola vez (ver CLAUDE.md →
// WhatsApp Share Principles).
export function buildOpenMatchWhatsappMessage(match: OpenMatch, url: string): string {
  const day = formatOpenMatchDayLong(match.matchDate);
  const time = formatOpenMatchTime(match.startTime);
  const level = match.level === "cualquiera" ? "cualquier nivel" : openMatchLevelLabel(match.level).toLowerCase();
  const need =
    match.spotsLeft <= 0
      ? "Ya estamos completos 🙌"
      : match.spotsLeft === 1
        ? "Nos falta 1 jugador 🎾"
        : `Nos faltan ${match.spotsLeft} jugadores 🎾`;
  const place = openMatchPlaceName(match);
  const where = place ? ` en ${place}` : "";
  return [
    `¿Juegas pádel? Armamos partido en ${match.city}${where}, el ${day} a las ${time} (${level}).`,
    need,
    `Únete aquí: ${url}`,
  ].join("\n");
}

// ─── Validación de cortesía (el servidor revalida todo) ─────────────────

export interface OpenMatchFormValues {
  city: string;
  matchDate: string;
  startTime: string;
  level: string;
  venueName: string;
  /** Establecimiento del directorio (opcional); excluye venueName. */
  venueId: string | null;
  comment: string;
  courtBooked: boolean;
  /** Solo al crear: jugadores que ya tiene el organizador, contándose (1-4). */
  playersAlready?: number;
}

/** Devuelve un mensaje de error en español, o null si es válido. */
export function validateOpenMatchForm(
  v: OpenMatchFormValues,
  now: { dateStr: string; minutesOfDay: number }
): string | null {
  const city = v.city.trim().replace(/\s+/g, " ");
  if (city.length < 2 || city.length > 60) return "Escribe la ciudad donde quieres jugar.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.matchDate)) return "Elige la fecha del partido.";
  if (!/^\d{2}:\d{2}$/.test(v.startTime)) return "Elige la hora tentativa.";
  const [h, m] = v.startTime.split(":").map(Number);
  if (v.matchDate < now.dateStr || (v.matchDate === now.dateStr && h * 60 + m <= now.minutesOfDay)) {
    return "La fecha y hora deben ser futuras.";
  }
  if (v.matchDate > addDays(now.dateStr, OPEN_MATCH_MAX_DAYS_AHEAD)) {
    return `Solo puedes crear partidos hasta ${OPEN_MATCH_MAX_DAYS_AHEAD} días adelante.`;
  }
  if (!isOpenMatchLevel(v.level)) return "Elige un nivel.";
  if (v.venueName.trim().length > OPEN_MATCH_VENUE_MAX) return "El lugar es demasiado largo.";
  if (v.comment.trim().length > OPEN_MATCH_COMMENT_MAX) return `El comentario admite hasta ${OPEN_MATCH_COMMENT_MAX} caracteres.`;
  if (v.playersAlready !== undefined && (v.playersAlready < 1 || v.playersAlready > OPEN_MATCH_MAX_PLAYERS)) {
    return "Indica cuántos jugadores ya tienes (1 a 4).";
  }
  return null;
}

export function maxOpenMatchDate(today: string): string {
  return addDays(today, OPEN_MATCH_MAX_DAYS_AHEAD);
}

// ─── Errores del servidor → mensajes ────────────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
  auth_required: "Inicia sesión para continuar.",
  platform_admin_not_allowed: "Las cuentas de plataforma no participan en partidos.",
  match_not_found: "Este partido no existe.",
  match_full: "El partido ya está completo.",
  match_cancelled: "El organizador canceló este partido.",
  match_started: "Este partido ya comenzó o terminó.",
  not_participant: "No haces parte de este partido.",
  not_organizer: "Solo el organizador puede hacer esto.",
  organizer_cannot_leave: "Como organizador no puedes salir: puedes cancelar el partido.",
  too_many_active_matches: "Ya tienes 5 partidos activos. Cancela uno o espera a que se jueguen.",
  invalid_city: "Escribe la ciudad donde quieres jugar.",
  invalid_datetime: "Elige fecha y hora.",
  datetime_in_past: "La fecha y hora deben ser futuras.",
  datetime_too_far: `Solo puedes crear partidos hasta ${OPEN_MATCH_MAX_DAYS_AHEAD} días adelante.`,
  invalid_level: "Elige un nivel válido.",
  invalid_venue: "El lugar es demasiado largo.",
  invalid_comment: `El comentario admite hasta ${OPEN_MATCH_COMMENT_MAX} caracteres.`,
  invalid_players_already: "Indica cuántos jugadores ya tienes (1 a 4).",
  invalid_guest_count: "Los invitados van de 0 a 3.",
  venue_unavailable: "Ese establecimiento ya no está disponible en el directorio. Elige otro o escribe el lugar.",
  venue_city_mismatch: "El establecimiento elegido no está en la ciudad del partido.",
  invalid_venue_selection: "Elige un establecimiento o quítalo, no ambas cosas.",
};

export function openMatchErrorMessage(error: { message?: string | null } | null | undefined): string {
  const key = (error?.message ?? "").trim();
  return ERROR_MESSAGES[key] ?? "No pudimos completar la acción. Intenta de nuevo.";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isOpenMatchId(value: string): boolean {
  return UUID_RE.test(value);
}
