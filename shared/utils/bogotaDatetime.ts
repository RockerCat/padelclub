// Torneos (Bloque 2.1) — the only place in the client app that converts a
// wall-clock instant typed by a user into a timestamptz for an RPC
// (tournaments.starts_at/registration_opens_at/registration_closes_at).
// Every other date-only field in the app (reservations) uses plain `date`/
// `time` columns and never needs this. Colombia has a single fixed UTC-05:00
// offset with no DST, but — same reasoning already applied in
// clubStatisticsRange.ts — the offset is derived via Intl instead of a
// hardcoded "-05:00" literal, so this keeps working correctly without a code
// change if that were ever to change.
const BOGOTA_TZ = "America/Bogota";

function bogotaOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BOGOTA_TZ,
    timeZoneName: "shortOffset",
  }).formatToParts(at);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const match = tzName.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return -300;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;
  return sign * (hours * 60 + minutes);
}

// value: "YYYY-MM-DDTHH:mm" from <input type="datetime-local">, interpreted
// as the wall-clock time in America/Bogota. Returns a UTC ISO string ready
// for a timestamptz RPC argument, or null for an empty value.
export function bogotaWallClockToISO(value: string): string | null {
  if (!value) return null;
  const offset = bogotaOffsetMinutes(new Date());
  const sign = offset <= 0 ? "-" : "+";
  const abs = Math.abs(offset);
  const oh = String(Math.floor(abs / 60)).padStart(2, "0");
  const om = String(abs % 60).padStart(2, "0");
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const d = new Date(`${withSeconds}${sign}${oh}:${om}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// "Ahora" en hora de pared de Bogotá — sin importar dónde corre el
// proceso (servidor de Next.js en Vercel/Node arranca en UTC salvo que se
// fije TZ, y este repo nunca la fija; un navegador o un teléfono reflejan
// su propia zona local). `new Date().getHours()`/`getDate()` devuelven la
// hora del PROCESO, no la del club — usar eso para "¿ya pasó este
// horario hoy?" rompe según dónde se ejecute el código, aunque el
// algoritmo sea idéntico. Esta es la única fuente correcta: Intl con
// BOGOTA_TZ, exactamente el mismo mecanismo que bogotaWallClockToISO/
// isoToBogotaWallClock ya usan arriba, nunca un offset fijo a mano.
export function getBogotaNow(): { dateStr: string; minutesOfDay: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BOGOTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  // hour12:false puede devolver "24" a medianoche en vez de "00" — se
  // normaliza módulo 24 para que minutesOfDay siempre quede en [0, 1440).
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    minutesOfDay: hour * 60 + minute,
  };
}

// Inverse — a UTC ISO timestamp (as read from tournaments.*_at) back into
// "YYYY-MM-DDTHH:mm" for a <input type="datetime-local"> defaultValue/value.
export function isoToBogotaWallClock(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
