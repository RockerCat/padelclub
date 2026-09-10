// Comercial v2 / Fase 2 — validación de la parte pura y testeable en TS del
// entitlement comercial. Run con:
//
//   npx tsx scripts/test-commercial-entitlement.ts
//
// La REGLA de negocio en sí (no subscription/trialing/active → permite;
// suspended → bloquea) vive en SQL (_require_commercial_access,
// get_club_commercial_access — 20261115000006_commercial_entitlement.sql)
// y solo puede verificarse de verdad contra un Postgres real con esa
// migración aplicada — mismo caso que la restricción de solapamiento de
// tarifas en test-reservation-pricing.ts, no ejecutable desde este
// entorno (ver el reporte de esta fase para el detalle). Lo que SÍ es
// lógica pura de TypeScript, y por eso se cubre aquí, es la selección de
// copy por rol cuando el backend rechaza — shared/commercial/access.ts.

import { readFileSync } from "fs";
import { join } from "path";
import {
  COMMERCIAL_ACCESS_DENIED_CODE,
  PLAYER_COMMERCIAL_BLOCKED_TITLE,
  PLAYER_COMMERCIAL_BLOCKED_MESSAGE,
  OWNER_COMMERCIAL_BLOCKED_MESSAGE,
  ADMIN_COMMERCIAL_BLOCKED_MESSAGE,
  getCommercialBlockedMessage,
} from "../shared/commercial/access";

let passed = 0;
let failed = 0;

function assertEqual<T>(actual: T, expected: T, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`OK   ${label}`);
  } else {
    failed++;
    console.error(`FAIL ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ─── Código de error estable ────────────────────────────────────────────────

assertEqual(COMMERCIAL_ACCESS_DENIED_CODE, "P0008", "código de error estable es P0008");

// ─── Copy por rol — nunca menciona pago/deuda para PLAYER, nunca para ADMIN ──

assertEqual(getCommercialBlockedMessage("PLAYER"), PLAYER_COMMERCIAL_BLOCKED_MESSAGE, "PLAYER recibe el mensaje neutral");
assertEqual(getCommercialBlockedMessage("OWNER"), OWNER_COMMERCIAL_BLOCKED_MESSAGE, "OWNER recibe el mensaje comercial");
assertEqual(getCommercialBlockedMessage("ADMIN"), ADMIN_COMMERCIAL_BLOCKED_MESSAGE, "ADMIN recibe el mensaje operativo sin pago");
// Cualquier valor no reconocido (incluido null/undefined, defensivo) cae al
// mensaje neutral — nunca al comercial, para no arriesgar mostrarle
// contexto de pago a alguien cuyo rol no se pudo determinar.
assertEqual(getCommercialBlockedMessage(null), PLAYER_COMMERCIAL_BLOCKED_MESSAGE, "rol desconocido (null) cae al mensaje neutral");
assertEqual(getCommercialBlockedMessage(undefined), PLAYER_COMMERCIAL_BLOCKED_MESSAGE, "rol desconocido (undefined) cae al mensaje neutral");
assertEqual(getCommercialBlockedMessage("SUPERADMIN"), PLAYER_COMMERCIAL_BLOCKED_MESSAGE, "rol no operativo cae al mensaje neutral");

const forbiddenWordsForPlayerAndAdmin = ["pago", "deuda", "factura", "wompi", "vencid", "suscrip", "owner", "propietario"];
for (const word of forbiddenWordsForPlayerAndAdmin) {
  assertEqual(
    PLAYER_COMMERCIAL_BLOCKED_MESSAGE.toLowerCase().includes(word),
    false,
    `mensaje PLAYER nunca menciona "${word}"`
  );
}
// ADMIN sí debe poder mencionar "propietario"/"owner" (se le pide contactarlo)
// — solo se excluyen las palabras de pago/deuda de esa lista para ADMIN.
for (const word of ["pago", "deuda", "factura", "wompi", "vencid"]) {
  assertEqual(
    ADMIN_COMMERCIAL_BLOCKED_MESSAGE.toLowerCase().includes(word),
    false,
    `mensaje ADMIN nunca menciona "${word}"`
  );
}

// ─── Fase 4 — Cierre UX: gate proactivo de Reservas ────────────────────────
// La regla de negocio (can_create_booking) sigue siendo 100% SQL — esto solo
// ancla, por texto fuente, que el frontend (a) usa el entitlement central
// sin derivarlo de fechas/status, y (b) el modal PLAYER reutiliza el copy
// pactado verbatim, nunca un duplicado hardcodeado que pueda divergir.

assertEqual(PLAYER_COMMERCIAL_BLOCKED_TITLE, "Reservas temporalmente no disponibles", "título PLAYER pactado, exacto");
assertEqual(
  PLAYER_COMMERCIAL_BLOCKED_MESSAGE,
  "En este momento el agendamiento de canchas no está disponible en este club. Para realizar una reserva, comunícate directamente con el club.",
  "texto PLAYER pactado, exacto"
);

{
  const playerCalendarPath = join(
    __dirname,
    "..",
    "src",
    "app",
    "(app)",
    "[club]",
    "reservations",
    "PlayerAvailabilityCalendar.tsx"
  );
  const playerCalendarText = readFileSync(playerCalendarPath, "utf8");

  assertEqual(
    playerCalendarText.includes("PLAYER_COMMERCIAL_BLOCKED_TITLE") && playerCalendarText.includes("PLAYER_COMMERCIAL_BLOCKED_MESSAGE"),
    true,
    "PlayerAvailabilityCalendar reutiliza las constantes compartidas (nunca un copy duplicado)"
  );
  assertEqual(
    playerCalendarText.includes("{PLAYER_COMMERCIAL_BLOCKED_TITLE}") && playerCalendarText.includes("{PLAYER_COMMERCIAL_BLOCKED_MESSAGE}"),
    true,
    "el modal renderiza esas constantes como expresión JSX, no como texto hardcodeado"
  );
  assertEqual(/>\s*Entendido\s*</.test(playerCalendarText), true, "el botón del modal dice exactamente 'Entendido'");
  assertEqual(
    playerCalendarText.includes("!editingReservation && !canCreateBooking"),
    true,
    "el gate proactivo nunca aplica a reprogramar una reserva ya existente (solo a crear una nueva)"
  );
}

{
  const playerPagePath = join(__dirname, "..", "src", "app", "(app)", "[club]", "reservations", "page.tsx");
  const adminPagePath = join(__dirname, "..", "src", "app", "(app)", "[club]", "admin", "reservations", "page.tsx");
  for (const [label, path] of [
    ["reservations/page.tsx (PLAYER)", playerPagePath],
    ["admin/reservations/page.tsx (OWNER/ADMIN)", adminPagePath],
  ] as const) {
    const text = readFileSync(path, "utf8");
    assertEqual(
      text.includes('"get_club_commercial_access"') && text.includes("can_create_booking"),
      true,
      `${label} obtiene can_create_booking de get_club_commercial_access (nunca derivado de fechas/status)`
    );
  }
}

{
  const weekCalendarPath = join(__dirname, "..", "src", "app", "(app)", "[club]", "admin", "reservations", "WeekCalendar.tsx");
  const adminAvailabilityPath = join(
    __dirname,
    "..",
    "src",
    "app",
    "(app)",
    "[club]",
    "admin",
    "reservations",
    "AdminAvailabilityView.tsx"
  );
  for (const [label, path] of [
    ["WeekCalendar.tsx", weekCalendarPath],
    ["AdminAvailabilityView.tsx", adminAvailabilityPath],
  ] as const) {
    const text = readFileSync(path, "utf8");
    assertEqual(
      text.includes("archived || commercialBlockedMessage"),
      true,
      `${label} bloquea la creación proactivamente junto con 'archived' (mismo patrón ya existente)`
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
