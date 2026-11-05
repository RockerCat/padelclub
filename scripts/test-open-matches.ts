// QA — Encuentra tu partido (capa TS).
//
// Prueba la lógica pura de shared/openMatches/openMatches.ts: mapeo del
// jsonb de los RPCs, formato en español, mensaje de WhatsApp, validación de
// cortesía y traducción de errores. Las reglas reales (cupos, concurrencia,
// permisos) se prueban contra SQL en scripts/test-open-matches.sql.
//
//   npm run test:open-matches

import { readFileSync } from "fs";
import { join } from "path";
import {
  buildOpenMatchWhatsappMessage,
  formatOpenMatchDay,
  formatOpenMatchDayLong,
  formatOpenMatchTime,
  formatSpotsLeft,
  isOpenMatchId,
  mapOpenMatch,
  mapOpenMatchList,
  openMatchErrorMessage,
  validateOpenMatchForm,
  type OpenMatchFormValues,
} from "../shared/openMatches/openMatches";

let passed = 0;
let failed = 0;
function assertEqual<T>(actual: T, expected: T, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log(`OK   ${label}`);
  } else {
    failed++;
    console.log(`FAIL ${label}\n     esperado: ${JSON.stringify(expected)}\n     obtenido: ${JSON.stringify(actual)}`);
  }
}

// ─── Mapeo ───────────────────────────────────────────────────────────────
const raw = {
  id: "11111111-2222-3333-4444-555555555555",
  city: "Bogotá",
  match_date: "2026-11-14",
  start_time: "19:30",
  level: "6a",
  max_players: 4,
  guest_count: 1,
  taken: 3,
  spots_left: 1,
  venue_name: null,
  court_status: "pending",
  comment: null,
  phase: "open",
  schedule_version: 2,
  schedule_changed_at: "2026-11-05T10:00:00Z",
  organizer_name: "Carlos M.",
  viewer_is_organizer: false,
  viewer_is_participant: true,
  viewer_needs_reconfirm: true,
  participants: [{ display_name: "Carlos M.", avatar_url: null, is_organizer: true, is_viewer: false, needs_reconfirm: false }],
};
const m = mapOpenMatch(raw)!;
assertEqual([m.matchDate, m.startTime, m.spotsLeft, m.phase, m.courtStatus], ["2026-11-14", "19:30", 1, "open", "pending"], "mapea campos principales");
assertEqual(m.viewerNeedsReconfirm, true, "mapea reconfirmación del viewer");
assertEqual(m.participants?.[0], { displayName: "Carlos M.", avatarUrl: null, isOrganizer: true, isViewer: false, needsReconfirm: false }, "mapea participantes");
assertEqual(mapOpenMatch(null), null, "null → null");
assertEqual(mapOpenMatchList("x"), [], "lista inválida → []");
assertEqual(mapOpenMatch({ ...raw, participants: undefined })!.participants, null, "lista sin participantes → null");

// ─── Formato ─────────────────────────────────────────────────────────────
assertEqual(formatOpenMatchDay("2026-11-14", "2026-11-14"), "Hoy", "hoy");
assertEqual(formatOpenMatchDay("2026-11-15", "2026-11-14"), "Mañana", "mañana");
assertEqual(formatOpenMatchDay("2026-11-14", "2026-11-01"), "sáb 14 nov", "día corto");
assertEqual(formatOpenMatchDay("2027-01-01", "2026-12-31"), "Mañana", "mañana cruzando año");
assertEqual(formatOpenMatchDayLong("2026-11-14"), "sábado 14 de noviembre", "día largo");
assertEqual(formatOpenMatchTime("19:30"), "7:30 p. m.", "hora pm");
assertEqual(formatOpenMatchTime("00:15"), "12:15 a. m.", "medianoche");
assertEqual(formatOpenMatchTime("12:00"), "12:00 p. m.", "mediodía");
assertEqual(formatSpotsLeft(1), "Falta 1 jugador", "singular");
assertEqual(formatSpotsLeft(3), "Faltan 3 jugadores", "plural");
assertEqual(formatSpotsLeft(0), "Completo", "completo");

// ─── WhatsApp ────────────────────────────────────────────────────────────
const msg = buildOpenMatchWhatsappMessage(m, "https://mipadel.club/partidos/x");
assertEqual(
  msg,
  "¿Juegas pádel? Armamos partido en Bogotá, el sábado 14 de noviembre a las 7:30 p. m. (6ª categoría).\nNos falta 1 jugador 🎾\nÚnete aquí: https://mipadel.club/partidos/x",
  "mensaje con fecha, ciudad, nivel y cupos"
);
assertEqual(/%[0-9A-F]{2}/i.test(msg), false, "el mensaje no viene pre-codificado");
assertEqual(
  buildOpenMatchWhatsappMessage({ ...m, venueName: "Club Norte", level: "cualquiera", spotsLeft: 2 }, "u").split("\n").slice(0, 2),
  ["¿Juegas pádel? Armamos partido en Bogotá en Club Norte, el sábado 14 de noviembre a las 7:30 p. m. (cualquier nivel).", "Nos faltan 2 jugadores 🎾"],
  "lugar y nivel abierto"
);

// ─── Validación ──────────────────────────────────────────────────────────
const now = { dateStr: "2026-11-04", minutesOfDay: 13 * 60 };
const base: OpenMatchFormValues = {
  city: "Bogotá", matchDate: "2026-11-05", startTime: "19:00", level: "6a",
  venueName: "", venueId: null, comment: "", courtBooked: false, playersAlready: 1,
};
assertEqual(validateOpenMatchForm(base, now), null, "formulario válido");
assertEqual(validateOpenMatchForm({ ...base, city: " " }, now) !== null, true, "ciudad vacía");
assertEqual(validateOpenMatchForm({ ...base, matchDate: "2026-11-04", startTime: "12:59" }, now) !== null, true, "hora pasada hoy");
assertEqual(validateOpenMatchForm({ ...base, matchDate: "2026-11-04", startTime: "13:30" }, now), null, "más tarde hoy es válido");
assertEqual(validateOpenMatchForm({ ...base, matchDate: "2027-01-04" }, now) !== null, true, "más de 60 días");
assertEqual(validateOpenMatchForm({ ...base, level: "pro" }, now) !== null, true, "nivel inválido");
assertEqual(validateOpenMatchForm({ ...base, playersAlready: 5 }, now) !== null, true, "5 jugadores");
assertEqual(validateOpenMatchForm({ ...base, comment: "x".repeat(281) }, now) !== null, true, "comentario largo");
assertEqual(validateOpenMatchForm({ ...base, playersAlready: undefined }, now), null, "editar no exige jugadores");

// ─── Errores ─────────────────────────────────────────────────────────────
assertEqual(openMatchErrorMessage({ message: "match_full" }), "El partido ya está completo.", "error conocido");
assertEqual(openMatchErrorMessage({ message: "boom" }), "No pudimos completar la acción. Intenta de nuevo.", "error desconocido → genérico");
assertEqual(isOpenMatchId(raw.id), true, "uuid válido");
assertEqual(isOpenMatchId("nuevo"), false, "slug no-uuid rechazado");

// ─── Cada error que lanza la migración tiene mensaje propio ─────────────
const sql = readFileSync(join(__dirname, "../supabase/migrations/20261116000001_open_matches.sql"), "utf8");
const raised = [...new Set([...sql.matchAll(/RAISE EXCEPTION '([a-z_]+)'/g)].map((x) => x[1]))];
const missing = raised.filter((code) => openMatchErrorMessage({ message: code }).startsWith("No pudimos"));
assertEqual(missing, [], `los ${raised.length} códigos de error SQL están traducidos`);

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
