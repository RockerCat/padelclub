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

import {
  COMMERCIAL_ACCESS_DENIED_CODE,
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

const forbiddenWordsForPlayerAndAdmin = ["pago", "deuda", "factura", "wompi", "vencid"];
for (const word of forbiddenWordsForPlayerAndAdmin) {
  assertEqual(
    PLAYER_COMMERCIAL_BLOCKED_MESSAGE.toLowerCase().includes(word),
    false,
    `mensaje PLAYER nunca menciona "${word}"`
  );
  assertEqual(
    ADMIN_COMMERCIAL_BLOCKED_MESSAGE.toLowerCase().includes(word),
    false,
    `mensaje ADMIN nunca menciona "${word}"`
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
