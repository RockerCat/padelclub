// QA — Directorio de establecimientos (capa TS).
//
// Prueba la lógica pura de shared/directory/venues.ts: mapeo del jsonb,
// normalización de teléfonos colombianos, enlaces seguros (mapa, tel,
// WhatsApp), validación del formulario SUPERADMIN, fusión club/ficha del
// directorio público (sin duplicados) y traducción de errores. Permisos,
// RLS y reglas de partidos se prueban contra SQL real en
// scripts/test-padel-venues.sql.
//
//   npm run test:directory

import { readFileSync } from "fs";
import { join } from "path";
import {
  EMPTY_VENUE_FORM,
  directoryCorrectionHref,
  formatColombianPhone,
  isAllowedMapsUrl,
  isSafeHttpsUrl,
  mapOpenMatchVenue,
  mapPadelVenue,
  mapPadelVenueAdmin,
  mergeDirectoryEntries,
  missingForPublication,
  normalizeColombianPhone,
  parseVenueForm,
  placeKey,
  venueErrorMessage,
  venueMapsHref,
  venueTelHref,
  venueWhatsappHref,
} from "../shared/directory/venues";
import { mapOpenMatch, openMatchErrorMessage, openMatchPlaceName, buildOpenMatchWhatsappMessage } from "../shared/openMatches/openMatches";

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

// ─── Teléfonos ───────────────────────────────────────────────────────────
assertEqual(normalizeColombianPhone("+57 310 123 4567"), "573101234567", "móvil con +57");
assertEqual(normalizeColombianPhone("310-123-4567"), "573101234567", "móvil local");
assertEqual(normalizeColombianPhone("(608) 740 1234"), "576087401234", "fijo 60x");
assertEqual(normalizeColombianPhone("  "), null, "vacío → null");
assertEqual(normalizeColombianPhone("7401234"), "invalid", "fijo viejo de 7 dígitos");
assertEqual(normalizeColombianPhone("+1 415 555 0100"), "invalid", "número extranjero");
assertEqual(normalizeColombianPhone("310abc4567"), "invalid", "letras");
assertEqual(formatColombianPhone("573101234567"), "310 123 4567", "formato móvil");
assertEqual(formatColombianPhone("576087401234"), "(608) 740 1234", "formato fijo");

// ─── URLs seguras ────────────────────────────────────────────────────────
assertEqual(isAllowedMapsUrl("https://maps.app.goo.gl/abc123"), true, "maps.app.goo.gl");
assertEqual(isAllowedMapsUrl("https://www.google.com/maps/place/x"), true, "google.com/maps");
assertEqual(isAllowedMapsUrl("https://waze.com/ul?ll=5,-73"), true, "waze");
assertEqual(isAllowedMapsUrl("http://maps.google.com/x"), false, "http rechazado");
assertEqual(isAllowedMapsUrl("javascript:alert(1)"), false, "javascript: rechazado");
assertEqual(isAllowedMapsUrl("https://google.com.evil.io/maps"), false, "dominio parecido rechazado");
assertEqual(isAllowedMapsUrl('https://maps.app.goo.gl/a"onclick=x'), false, "comillas rechazadas");
assertEqual(isSafeHttpsUrl("https://instagram.com/club"), true, "fuente https");
assertEqual(isSafeHttpsUrl("https://a b.com"), false, "fuente con espacio");

// ─── Mapeo (defensa en profundidad) ──────────────────────────────────────
const rawVenue = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  name: "Pádel Center Tunja",
  department: "Boyacá",
  municipality: "Tunja",
  address: "Cra 10 # 20-30",
  latitude: "5.535000",
  longitude: -73.367,
  maps_url: "javascript:alert(1)",
  phone: "573101234567",
  whatsapp: "12345",
  verified_at: "2026-11-01",
  club: null,
};
const v = mapPadelVenue(rawVenue)!;
assertEqual([v.latitude, v.longitude], [5.535, -73.367], "coordenadas numéricas");
assertEqual(v.mapsUrl, null, "mapa inseguro nunca se renderiza");
assertEqual(v.whatsapp, null, "WhatsApp inválido nunca se renderiza");
assertEqual(Object.keys(v).includes("sourceLabel"), false, "ficha pública sin procedencia");
assertEqual(mapPadelVenue({ name: "x" }), null, "sin id → null");

const unpublished = mapOpenMatchVenue({ ...rawVenue, maps_url: null, whatsapp: "573101234567", is_published: false })!;
assertEqual([unpublished.isPublished, unpublished.phone, unpublished.whatsapp, unpublished.address], [false, null, null, null], "despublicado: sin contacto ni dirección");
assertEqual(unpublished.name, "Pádel Center Tunja", "despublicado conserva nombre");

const admin = mapPadelVenueAdmin({ ...rawVenue, status: "published", source_label: "Instagram", source_url: "javascript:x", match_count: "3" })!;
assertEqual([admin.status, admin.sourceLabel, admin.sourceUrl, admin.matchCount], ["published", "Instagram", null, 3], "mapeo admin");

// ─── Enlaces de contacto ─────────────────────────────────────────────────
assertEqual(venueMapsHref({ ...v, mapsUrl: "https://maps.app.goo.gl/x" }), "https://maps.app.goo.gl/x", "mapa de la ficha primero");
assertEqual(venueMapsHref(v), "https://www.google.com/maps/search/?api=1&query=5.535,-73.367", "si no, coordenadas");
assertEqual(
  venueMapsHref({ ...v, latitude: null, longitude: null }),
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Pádel Center Tunja, Cra 10 # 20-30, Tunja, Boyacá")}`,
  "si no, búsqueda por dirección pública"
);
assertEqual(venueMapsHref({ ...v, latitude: null, longitude: null, address: null }), null, "sin datos → sin botón");
assertEqual(venueTelHref("573101234567"), "tel:+573101234567", "tel:");
assertEqual(venueTelHref("abc"), null, "tel inválido → sin botón");
const wa = venueWhatsappHref("573101234567", "¿Tienen cancha? 🎾")!;
assertEqual(wa.startsWith("https://wa.me/573101234567?text="), true, "WhatsApp a número fijo usa wa.me/<phone>");
assertEqual(decodeURIComponent(wa.split("text=")[1]), "¿Tienen cancha? 🎾", "mensaje codificado una sola vez");
assertEqual(venueWhatsappHref(null), null, "sin WhatsApp → sin botón");
assertEqual(directoryCorrectionHref("Club X").includes(encodeURIComponent('"Club X"')), true, "corrección por canal existente");

// ─── Formulario SUPERADMIN ───────────────────────────────────────────────
const today = "2026-11-05";
const form = { ...EMPTY_VENUE_FORM, name: "  Pádel  Norte ", municipality: "Tunja", phone: "310 123 4567", latitude: "5,53", longitude: "-73.36" };
const ok = parseVenueForm(form, today);
assertEqual(ok.ok && [ok.input.name, ok.input.department, ok.input.phone, ok.input.latitude, ok.input.address], ["Pádel Norte", "Boyacá", "573101234567", 5.53, null], "parse normaliza (Boyacá por defecto)");
assertEqual(parseVenueForm({ ...form, latitude: "5.5", longitude: "" }, today).ok, false, "coordenadas incompletas");
assertEqual(parseVenueForm({ ...form, mapsUrl: "https://evil.com/maps" }, today).ok, false, "mapa de dominio desconocido");
assertEqual(parseVenueForm({ ...form, whatsapp: "123" }, today).ok, false, "WhatsApp inválido");
assertEqual(parseVenueForm({ ...form, verifiedAt: "2026-11-06" }, today).ok, false, "verificación futura");
assertEqual(parseVenueForm({ ...form, phone: "", whatsapp: "" }, today).ok, true, "teléfono y WhatsApp opcionales");
assertEqual(missingForPublication({ address: null, sourceLabel: "x", verifiedAt: null }), ["dirección", "fecha de verificación"], "qué falta para publicar");

// ─── Directorio unificado: sin duplicados ────────────────────────────────
const clubs = [
  { id: "c1", name: "Sogamoso Pádel", city: null, state: null, latitude: null, longitude: null, slug: "sogamoso" },
  { id: "c2", name: "Bogotá Club", city: "Bogotá", state: "Bogotá D.C.", latitude: 4.6, longitude: -74.1, slug: "bog" },
];
const venues = [
  { ...v, id: "v1", name: "Sogamoso Pádel (ficha)", municipality: "Sogamoso", club: { id: "c1", name: "Sogamoso Pádel", slug: "sogamoso", visibility: "public" } },
  { ...v, id: "v2", name: "Aguas Pádel", club: null },
  // Vinculada a un club que no está visible (desactivado/archivado): se muestra como ficha neutral.
  { ...v, id: "v3", name: "Zeta Pádel", club: { id: "c-hidden", name: "Z", slug: "z", visibility: "public" } },
];
const merged = mergeDirectoryEntries(clubs, venues);
assertEqual(merged.map((e) => `${e.kind}:${e.id}`), ["venue:v2", "club:c2", "club:c1", "venue:v3"], "club vinculado aparece una sola vez (como club)");
const sog = merged.find((e) => e.id === "c1")!;
assertEqual([sog.municipality, sog.department, sog.latitude], ["Sogamoso", "Boyacá", 5.535], "club sin ubicación la toma de su ficha");
assertEqual(merged.find((e) => e.id === "c2")!.latitude, 4.6, "coordenadas del club tienen prioridad");
assertEqual(placeKey("  Boyacá "), placeKey("boyaca"), "clave de lugar sin tildes");

// ─── Partidos abiertos con lugar ─────────────────────────────────────────
const match = mapOpenMatch({
  id: "11111111-2222-3333-4444-555555555555", city: "Tunja", match_date: "2026-11-14", start_time: "19:30",
  level: "6a", max_players: 4, taken: 3, spots_left: 1, venue_name: null, court_status: "pending",
  venue: { ...rawVenue, maps_url: null, is_published: true }, phase: "open",
})!;
assertEqual(match.venue?.name, "Pádel Center Tunja", "partido mapea el establecimiento");
assertEqual(match.courtStatus, "pending", "elegir lugar no implica cancha reservada");
assertEqual(openMatchPlaceName(match), "Pádel Center Tunja", "lugar a mostrar = establecimiento");
assertEqual(openMatchPlaceName({ venue: null, venueName: "Club Norte" }), "Club Norte", "si no, texto libre");
assertEqual(buildOpenMatchWhatsappMessage(match, "u").split("\n")[0].includes("en Tunja en Pádel Center Tunja"), true, "mensaje de WhatsApp nombra el lugar");

// ─── Cada error que lanza la migración tiene mensaje propio ─────────────
const sql = readFileSync(join(__dirname, "../supabase/migrations/20261117000001_padel_venues_directory.sql"), "utf8");
const raised = [...new Set([...sql.matchAll(/RAISE EXCEPTION '([A-Za-z_ ]+)'/g)].map((x) => x[1]))];
const openMatchCodes = ["venue_unavailable", "venue_city_mismatch"];
// Los códigos de las funciones de partidos recreadas aquí los traduce
// openMatchErrorMessage; los del directorio, venueErrorMessage.
const untranslated = (c: string) =>
  venueErrorMessage({ message: c }).startsWith("No pudimos") && openMatchErrorMessage({ message: c }).startsWith("No pudimos");
assertEqual(raised.filter(untranslated), [], `los ${raised.length} códigos SQL de la migración están traducidos`);
assertEqual(
  openMatchCodes.filter((c) => openMatchErrorMessage({ message: c }).startsWith("No pudimos")),
  [],
  "errores de lugar traducidos también en partidos"
);

// ─── Sin campos de branding de terceros ─────────────────────────────────
const tableDef = sql.slice(sql.indexOf("CREATE TABLE public.padel_venues"), sql.indexOf("CREATE UNIQUE INDEX padel_venues_identity_uidx"));
assertEqual(/logo|photo|image|gallery|review|description/i.test(tableDef), false, "la tabla no admite logos, fotos, reseñas ni descripciones");

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
