// URL amigable para /[club]/reservations/[reservationSlug] — puramente
// cosmética. La reserva SIEMPRE se resuelve por su uuid real
// (reservations.id) o, para el slug corto nuevo, por una búsqueda exacta
// (club + fecha/hora + nombre del creador) resuelta server-side vía la RPC
// resolve_reservation_slug (20261103000001) — el texto del slug nunca es,
// por sí solo, la fuente de verdad ni concede acceso a nada: solo apunta a
// un uuid, y ese uuid pasa exactamente por el mismo control de acceso
// (get_reservation_share_detail) que ya existía.
//
// Tres formatos, todos resueltos por page.tsx sin ambigüedad:
//   1. uuid puro                          — enlaces ya compartidos antes de
//                                            cualquiera de estos cambios.
//   2. "nombre-fecha-uuid" (slug anterior) — el formato del turno pasado.
//   3. "nombre-YYYYMMDDHHmm" (slug nuevo)  — el formato que se genera ahora,
//                                            sin uuid visible.
// Los formatos 1 y 2 siempre contienen un uuid real en el texto —
// extractReservationId lo encuentra con una regex, sin que importe el
// formato exacto. El formato 3 nunca contiene un uuid — se reconoce porque
// termina en exactamente 12 dígitos, y se resuelve vía
// resolve_reservation_slug (ver @/lib/reservationJoinRequests).

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
// Nombre + exactamente 12 dígitos (YYYYMMDDHHmm) al final — nunca coincide
// con un slug que ya contiene un uuid (36 caracteres con guiones, nunca 12
// dígitos puros consecutivos).
const SHORT_SLUG_RE = /^(.+)-(\d{12})$/;

/** Extrae el uuid real de cualquier valor del segmento de ruta — un uuid
 *  puro, o cualquier slug (viejo o nuevo) que lo lleve incrustado. null si
 *  el string no contiene ningún uuid (p. ej. el slug corto nuevo, que debe
 *  resolverse aparte vía resolve_reservation_slug). */
export function extractReservationId(routeParam: string): string | null {
  const match = routeParam.match(UUID_RE);
  return match ? match[0].toLowerCase() : null;
}

/** nombre-fecha-hora (formato corto, sin uuid) → sus tres componentes, o
 *  null si el segmento no tiene esa forma. La fecha/hora vienen ya listas
 *  para pasar directo a Postgres (date/time). */
export function parseShortReservationSlug(
  routeParam: string
): { namePart: string; date: string; startTime: string } | null {
  const match = routeParam.match(SHORT_SLUG_RE);
  if (!match) return null;
  const [, namePart, digits] = match;
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);
  const hour = digits.slice(8, 10);
  const minute = digits.slice(10, 12);
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
  if (Number(hour) > 23 || Number(minute) > 59) return null;
  return { namePart, date: `${year}-${month}-${day}`, startTime: `${hour}:${minute}:00` };
}

/** Misma normalización en JS y en SQL (resolve_reservation_slug) —
 *  necesario para que el nombre del slug generado acá siempre coincida con
 *  la comparación que hace la RPC. */
export function slugifyNamePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos (á -> a)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Construye el slug corto y estable para compartir: nombre del creador
 *  (o "reserva" si no está disponible) + fecha y hora de inicio en
 *  YYYYMMDDHHmm. Nunca incluye el uuid — la reserva se resuelve server-side
 *  (uuid si el segmento lo trae, o resolve_reservation_slug si no). */
export function buildReservationSlug(params: {
  creatorName?: string | null;
  date: string; // YYYY-MM-DD
  startTime: string; // "HH:MM" o "HH:MM:SS"
}): string {
  const namePart = params.creatorName ? slugifyNamePart(params.creatorName) : "";
  const [y, m, d] = params.date.split("-");
  const [h, mi] = params.startTime.split(":");
  const digits = `${y}${m}${d}${h}${mi}`;
  return `${namePart || "reserva"}-${digits}`;
}
