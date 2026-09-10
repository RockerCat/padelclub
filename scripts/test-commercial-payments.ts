// Comercial v2 / Fase 3 — validación de la lógica pura y testeable en TS del
// ciclo de pagos Wompi. Run con:
//
//   npx tsx scripts/test-commercial-payments.ts
//
// Igual que test-commercial-entitlement.ts: la parte que solo puede
// verificarse contra un Postgres real con la migración aplicada (crear un
// payment, procesar un evento, extender un período, transicionar estados
// vía cron) no se cubre aquí — ver el reporte de esta fase. Lo que SÍ es
// lógica pura de TypeScript y por eso se cubre: la firma de integridad del
// checkout, el checksum de eventos, y la derivación de fase comercial para
// el banner.

import { readFileSync } from "fs";
import { join } from "path";
import {
  buildCheckoutIntegritySignature,
  buildEventChecksum,
  checksumsMatch,
  amountInCents,
  isSupportedWompiEvent,
  isSupportedWompiStatus,
  matchesExpectedWompiEnvironment,
  resolveOrderedPropertyValues,
  getIncompleteWompiTransactionFields,
  sanitizeWompiEventPayload,
  wompiKeysMatchEnvironment,
  compareVerifiedWompiTransaction,
  type VerifiedWompiTransaction,
} from "../shared/commercial/wompi";
import { deriveCommercialPhase, getTrialDaysRemaining, getCommercialPillContent } from "../shared/commercial/lifecycle";
import { verifyWompiTransaction } from "../src/lib/wompi/verifyTransaction";
import type { WompiConfig } from "../src/lib/wompi/config";

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

// ─── amount_in_cents ────────────────────────────────────────────────────────

assertEqual(amountInCents(99990), 9999000, "promo COP $99.990 → 9,999,000 cents");
assertEqual(amountInCents(120000), 12000000, "base COP $120.000 → 12,000,000 cents");
assertEqual(Number.isInteger(amountInCents(99990)), true, "amount_in_cents es siempre entero");

// ─── Firma de integridad del checkout ──────────────────────────────────────
// Fórmula documentada: SHA256(reference + amountInCents + currency + secret).
// Verificamos consistencia interna (mismo input → mismo output, inputs
// distintos → outputs distintos) y la forma del resultado (64 hex chars) —
// no un ejemplo numérico de la documentación, que no pudimos reproducir
// byte a byte al verificarlo computacionalmente en esta misma fase (ver
// comentario en shared/commercial/wompi.ts). Recomendado confirmar con una
// transacción real de Sandbox antes de producción.

const sigA = buildCheckoutIntegritySignature({
  reference: "sub_test_reference_1",
  amountInCents: 9999000,
  currency: "COP",
  integritySecret: "test_integrity_fixture_secret",
});
const sigB = buildCheckoutIntegritySignature({
  reference: "sub_test_reference_1",
  amountInCents: 9999000,
  currency: "COP",
  integritySecret: "test_integrity_fixture_secret",
});
const sigDifferentAmount = buildCheckoutIntegritySignature({
  reference: "sub_test_reference_1",
  amountInCents: 12000000,
  currency: "COP",
  integritySecret: "test_integrity_fixture_secret",
});

assertEqual(sigA, sigB, "misma referencia/monto/moneda/secreto → misma firma");
assertEqual(sigA.length, 64, "la firma es un hex SHA256 de 64 caracteres");
assertEqual(/^[0-9a-f]{64}$/.test(sigA), true, "la firma es hex minúscula válida");
assertEqual(sigA === sigDifferentAmount, false, "un monto distinto produce una firma distinta");

// ─── Checksum de eventos (webhook) ─────────────────────────────────────────

const checksumA = buildEventChecksum({
  orderedPropertyValues: ["01-test-transaction-id", "APPROVED", 9999000],
  timestamp: 1735689600,
  eventsSecret: "test_events_fixture_secret",
});
const checksumSameInput = buildEventChecksum({
  orderedPropertyValues: ["01-test-transaction-id", "APPROVED", 9999000],
  timestamp: 1735689600,
  eventsSecret: "test_events_fixture_secret",
});
const checksumDifferentStatus = buildEventChecksum({
  orderedPropertyValues: ["01-test-transaction-id", "DECLINED", 9999000],
  timestamp: 1735689600,
  eventsSecret: "test_events_fixture_secret",
});

assertEqual(checksumA, checksumSameInput, "mismo payload/timestamp/secreto → mismo checksum");
assertEqual(checksumA.length, 64, "el checksum es un hex SHA256 de 64 caracteres");
assertEqual(checksumA === checksumDifferentStatus, false, "un status distinto produce un checksum distinto");
assertEqual(checksumsMatch(checksumA.toUpperCase(), checksumA), true, "la comparación de checksum ignora mayúsculas/minúsculas");
assertEqual(checksumsMatch(checksumA, checksumDifferentStatus), false, "checksums distintos nunca coinciden");

// Orden de las properties importa — nunca un array fijo, siempre el orden
// real que trae signature.properties del evento.
const checksumReorderedProps = buildEventChecksum({
  orderedPropertyValues: ["APPROVED", "01-test-transaction-id", 9999000],
  timestamp: 1735689600,
  eventsSecret: "test_events_fixture_secret",
});
assertEqual(checksumA === checksumReorderedProps, false, "el orden de las properties cambia el checksum");

// ─── Fase comercial (banner) ────────────────────────────────────────────────

const NOW = new Date("2026-09-10T12:00:00Z");

assertEqual(
  deriveCommercialPhase({ status: null, trialEndsAt: null, currentPeriodEnd: null, now: NOW }).phase,
  "no_subscription",
  "sin fila de suscripción → no_subscription (legacy, nunca banner)"
);

assertEqual(
  deriveCommercialPhase({
    status: "trialing",
    trialEndsAt: "2026-09-20T12:00:00Z",
    currentPeriodEnd: null,
    now: NOW,
  }).phase,
  "trial",
  "trialing dentro de los 30 días → trial (sin banner)"
);

assertEqual(
  deriveCommercialPhase({
    status: "trialing",
    trialEndsAt: "2026-09-05T12:00:00Z", // venció hace 5 días
    currentPeriodEnd: null,
    now: NOW,
  }).phase,
  "trial_grace",
  "trialing vencido, día 5 de gracia → trial_grace"
);

{
  const result = deriveCommercialPhase({
    status: "trialing",
    trialEndsAt: "2026-09-05T12:00:00Z",
    currentPeriodEnd: null,
    now: NOW,
  });
  assertEqual(
    result.graceDeadline?.toISOString(),
    "2026-09-19T12:00:00.000Z",
    "deadline de gracia post-trial = trial_ends_at + 14 días exactos"
  );
}

assertEqual(
  deriveCommercialPhase({ status: "active", trialEndsAt: null, currentPeriodEnd: "2026-10-01T00:00:00Z", now: NOW }).phase,
  "active",
  "active → active (sin banner)"
);

{
  const result = deriveCommercialPhase({
    status: "past_due",
    trialEndsAt: null,
    currentPeriodEnd: "2026-09-01T00:00:00Z",
    now: NOW,
  });
  assertEqual(result.phase, "past_due", "past_due → past_due");
  assertEqual(
    result.graceDeadline?.toISOString(),
    "2026-10-01T00:00:00.000Z",
    "deadline de gracia past_due = current_period_end + 30 días exactos"
  );
}

assertEqual(
  deriveCommercialPhase({ status: "suspended", trialEndsAt: null, currentPeriodEnd: null, now: NOW }).phase,
  "suspended",
  "suspended → suspended"
);

assertEqual(
  deriveCommercialPhase({ status: "cancelled", trialEndsAt: null, currentPeriodEnd: null, now: NOW }).phase,
  "unrecognized",
  "cancelled → unrecognized (sin decisión de producto, nunca banner)"
);

// ─── Fase 4 — condiciones de frontera exactas (off-by-one, < vs <=) ────────
// deriveCommercialPhase usa `now <= trialEndsAt` (nunca `<`) — en el
// instante EXACTO de trial_ends_at, el trial real todavía cuenta como
// vigente, nunca como gracia. Determinista: `now` es un parámetro explícito
// acá, así que esto se prueba sin ninguna condición de carrera (a
// diferencia de la RPC SQL real, que sí depende del wall-clock del server —
// ver la verificación en vivo de esta misma fase, reportada aparte).
const TRIAL_ENDS_EXACT = "2026-09-10T12:00:00.000Z";
assertEqual(
  deriveCommercialPhase({ status: "trialing", trialEndsAt: TRIAL_ENDS_EXACT, currentPeriodEnd: null, now: new Date(TRIAL_ENDS_EXACT) })
    .phase,
  "trial",
  "now === trial_ends_at exacto → todavía trial, no trial_grace (now <= trialEndsAt)"
);
assertEqual(
  deriveCommercialPhase({
    status: "trialing",
    trialEndsAt: TRIAL_ENDS_EXACT,
    currentPeriodEnd: null,
    now: new Date(new Date(TRIAL_ENDS_EXACT).getTime() + 1),
  }).phase,
  "trial_grace",
  "now === trial_ends_at + 1ms → ya trial_grace"
);

// La RPC SQL (run_commercial_lifecycle_transitions) transiciona
// trialing→suspended con `trial_ends_at + interval '14 days' < now()` — el
// deadline de gracia calculado por deriveCommercialPhase debe ser
// EXACTAMENTE ese mismo instante, para que "trial_grace" (frontend) y "aún
// no suspendido" (backend) dejen de ser ciertos en el mismo momento, nunca
// uno antes que el otro.
{
  // trialEndsAt en el pasado respecto a `now` (a diferencia de
  // TRIAL_ENDS_EXACT arriba, que es igual a `now` y por eso da fase
  // "trial", sin graceDeadline) — acá sí cae en la rama trial_grace.
  const trialEndsPast = "2026-09-05T12:00:00.000Z";
  assertEqual(
    deriveCommercialPhase({ status: "trialing", trialEndsAt: trialEndsPast, currentPeriodEnd: null, now: NOW }).graceDeadline?.toISOString(),
    new Date(new Date(trialEndsPast).getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    "graceDeadline coincide exactamente con el umbral que usa la RPC (trial_ends_at + 14 días)"
  );
}

// ─── Fase 4 — la RPC de cron usa `<` estricto, nunca `<=` (auditoría de texto) ──
// No hay Postgres real en este entorno (ver CLAUDE.md/convención de este
// repo) — esto ancla el operador exacto de cada transición leyendo el texto
// real de la migración aplicada, para que un cambio futuro de `<` a `<=`
// (que correría la ventana de gracia un instante) rompa este test en vez de
// pasar desapercibido. La verificación funcional real (¿transiciona cuando
// debe?) se hizo en vivo contra la RPC real en un club de QA — ver el
// reporte de Fase 4.
{
  const migrationPath = join(__dirname, "..", "supabase", "migrations", "20261115000007_commercial_payments.sql");
  const migrationText = readFileSync(migrationPath, "utf8");
  assertEqual(
    migrationText.includes("WHERE cs.status = 'active' AND cs.current_period_end < now();"),
    true,
    "active→past_due usa current_period_end < now() estricto"
  );
  assertEqual(
    migrationText.includes("AND cs.trial_ends_at + interval '14 days' < now();"),
    true,
    "trialing(gracia)→suspended usa trial_ends_at + 14 días < now() estricto"
  );
  assertEqual(
    migrationText.includes("AND cs.current_period_end + interval '30 days' < now();"),
    true,
    "past_due→suspended usa current_period_end + 30 días < now() estricto"
  );
}

// ─── Fase 4 — entitlement real (SQL, ancla de texto) ───────────────────────
// El booleano real de acceso (v_allowed) vive solo en SQL — no hay (ni debe
// haber, para no duplicar la regla) un espejo en TypeScript. Se ancla por
// texto contra la migración aplicada: cualquier status "IS DISTINCT FROM
// 'suspended'" permite (legacy sin fila, trialing, trialing en gracia,
// active, past_due, e incluso 'cancelled' aunque ningún camino lo produzca
// hoy — ver el comentario de cabecera de 20261115000006) — solo 'suspended'
// bloquea. Confirma también que las tres únicas funciones que pueden crear
// una reserva o un torneo (ver CLAUDE.md → Commercial Subscription
// Principles) llaman a este guard.
{
  const entitlementPath = join(__dirname, "..", "supabase", "migrations", "20261115000006_commercial_entitlement.sql");
  const entitlementText = readFileSync(entitlementPath, "utf8");
  const paymentsMigrationText = readFileSync(
    join(__dirname, "..", "supabase", "migrations", "20261115000007_commercial_payments.sql"),
    "utf8"
  );

  assertEqual(
    entitlementText.includes("IF v_status = 'suspended' THEN\n    RAISE EXCEPTION 'commercial_access_denied' USING ERRCODE = 'P0008';"),
    true,
    "_require_commercial_access bloquea únicamente cuando status = 'suspended'"
  );
  assertEqual(
    entitlementText.includes("IF NOT FOUND THEN\n    RETURN;\n  END IF;") &&
      entitlementText.indexOf("IF NOT FOUND THEN\n    RETURN;\n  END IF;") < entitlementText.indexOf("v_status = 'suspended'"),
    true,
    "club legacy sin fila (NOT FOUND) permite ANTES de siquiera evaluar suspended — legacy allow real"
  );
  // get_club_commercial_access vigente es la de 00007 (misma regla,
  // extendida solo con current_period_end en el RETURNS TABLE — ver su
  // propio comentario de cabecera "byte-idéntica a Fase 2").
  assertEqual(
    paymentsMigrationText.includes("v_allowed := (v_status IS DISTINCT FROM 'suspended');"),
    true,
    "get_club_commercial_access (vigente, 00007) usa la misma regla IS DISTINCT FROM 'suspended'"
  );
  for (const fn of ["create_reservation_player", "create_reservation_admin", "create_tournament"]) {
    const fnStart = entitlementText.indexOf(`FUNCTION public.${fn}(`);
    const nextFnStart = entitlementText.indexOf("CREATE OR REPLACE FUNCTION", fnStart + 1);
    const fnBody = entitlementText.slice(fnStart, nextFnStart === -1 ? undefined : nextFnStart);
    assertEqual(
      fnStart > -1 && fnBody.includes("_require_club_not_archived") && fnBody.includes("_require_commercial_access"),
      true,
      `${fn} llama _require_commercial_access (después de _require_club_not_archived)`
    );
  }
}

// ─── Regla de inicio de período pagado (Ninja #1) ──────────────────────────
// IMPORTANTE: esto es un ESPEJO en TypeScript de la regla que en realidad
// vive y se aplica en SQL (process_wompi_transaction_event,
// 20261115000007_commercial_payments.sql) — nunca se importa desde ningún
// código de producción, existe únicamente para poder expresar la regla como
// test ejecutable sin una base de datos real. La única autoridad real es la
// función SQL; si esa migración cambia esta regla, este espejo debe
// actualizarse a mano para que el test siga siendo honesto. Esto NO prueba
// que el SQL esté bien escrito — solo que la regla, tal como la entendemos,
// es internamente consistente para los 6 escenarios pedidos.
function mirrorNewPeriodStart(input: {
  status: "trialing" | "active" | "past_due" | "suspended";
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  now: Date;
}): Date {
  const { status, trialEndsAt, currentPeriodEnd, now } = input;
  if (status === "trialing" && trialEndsAt && new Date(trialEndsAt) > now) {
    return new Date(trialEndsAt);
  }
  if (status === "trialing") {
    return now; // trial_ends_at ya pasado — gracia post-trial.
  }
  if (status === "active" && currentPeriodEnd && new Date(currentPeriodEnd) > now) {
    return new Date(currentPeriodEnd);
  }
  return now; // active vencido, past_due, o suspended.
}

const PAY_NOW = new Date("2026-09-20T00:00:00Z");

// 1. Trial vigente (9 sep → 9 oct) + pago el 20 sep → arranca en trial_ends_at.
assertEqual(
  mirrorNewPeriodStart({ status: "trialing", trialEndsAt: "2026-10-09T00:00:00Z", currentPeriodEnd: null, now: PAY_NOW }).toISOString(),
  "2026-10-09T00:00:00.000Z",
  "trial vigente + pago anticipado → nuevo período arranca en trial_ends_at (nunca en now())"
);

// 2. Trial ya vencido (gracia post-trial) + pago → arranca en now().
assertEqual(
  mirrorNewPeriodStart({ status: "trialing", trialEndsAt: "2026-09-09T00:00:00Z", currentPeriodEnd: null, now: PAY_NOW }).toISOString(),
  PAY_NOW.toISOString(),
  "trial vencido (gracia post-trial) + pago → nuevo período arranca en now()"
);

// 3. Active vigente (renovación anticipada) → arranca en current_period_end.
assertEqual(
  mirrorNewPeriodStart({ status: "active", trialEndsAt: null, currentPeriodEnd: "2026-10-01T00:00:00Z", now: PAY_NOW }).toISOString(),
  "2026-10-01T00:00:00.000Z",
  "active vigente + pago anticipado → nuevo período arranca en current_period_end"
);

// 4. Active ya vencido → arranca en now().
assertEqual(
  mirrorNewPeriodStart({ status: "active", trialEndsAt: null, currentPeriodEnd: "2026-09-01T00:00:00Z", now: PAY_NOW }).toISOString(),
  PAY_NOW.toISOString(),
  "active ya vencido + pago → nuevo período arranca en now()"
);

// 5. past_due → arranca en now().
assertEqual(
  mirrorNewPeriodStart({ status: "past_due", trialEndsAt: null, currentPeriodEnd: "2026-08-01T00:00:00Z", now: PAY_NOW }).toISOString(),
  PAY_NOW.toISOString(),
  "past_due + pago → nuevo período arranca en now()"
);

// 6. suspended → arranca en now().
assertEqual(
  mirrorNewPeriodStart({ status: "suspended", trialEndsAt: null, currentPeriodEnd: "2026-07-01T00:00:00Z", now: PAY_NOW }).toISOString(),
  PAY_NOW.toISOString(),
  "suspended + pago (reactivación) → nuevo período arranca en now()"
);

// ─── Un solo Wompi 'pending' por suscripción (Ninja #1) ────────────────────
// Esto NO ejecuta Postgres — no puede probar que la constraint realmente
// bloquea una inserción concurrente. Lo único que se verifica de forma
// honesta es que el texto de la migración contiene las piezas que hacen
// esa garantía posible: el índice único parcial, la reutilización de un
// pending existente antes de insertar, y el manejo de unique_violation
// para no propagar un error visible al OWNER si dos transacciones chocan.
// QA real (Caso G del prompt de Fase 3, más una prueba de concurrencia
// explícita) queda pendiente para después de aplicar la migración.
const migrationPath = join(__dirname, "..", "supabase", "migrations", "20261115000007_commercial_payments.sql");
const migrationSql = readFileSync(migrationPath, "utf8");

assertEqual(
  migrationSql.includes("payments_one_pending_per_subscription_idx"),
  true,
  "la migración define el índice único parcial de un solo pending por suscripción"
);
assertEqual(
  /UNIQUE INDEX payments_one_pending_per_subscription_idx\s*\n\s*ON public\.payments \(subscription_id\)\s*\n\s*WHERE provider = 'wompi' AND status = 'pending';/.test(
    migrationSql
  ),
  true,
  "el índice es exactamente (subscription_id) WHERE provider='wompi' AND status='pending'"
);
assertEqual(
  migrationSql.includes("WHEN unique_violation THEN"),
  true,
  "create_pending_payment maneja unique_violation en vez de propagar el error al OWNER"
);
assertEqual(
  /SELECT \* INTO v_existing[\s\S]*?WHERE pay\.subscription_id = v_subscription_id[\s\S]*?AND pay\.status = 'pending'/.test(
    migrationSql
  ),
  true,
  "create_pending_payment reutiliza un pending existente antes de intentar insertar uno nuevo"
);

// ─── Hardening del webhook (Ninja #2) ──────────────────────────────────────
// Estas pruebas SÍ ejecutan la lógica real que route.ts importa y usa
// (shared/commercial/wompi.ts) — no son un espejo duplicado. Lo que NO se
// ejecuta acá es el Route Handler completo en sí (NextRequest/NextResponse,
// lectura de headers, invocación real de la RPC vía service_role) — eso
// requiere un entorno Next.js/Postgres real. Declarado explícitamente para
// no fingir una integración que este script no hace.

// 1-2. Evento soportado.
assertEqual(isSupportedWompiEvent("transaction.updated"), true, "evento transaction.updated es aceptado");
assertEqual(isSupportedWompiEvent("transaction.voided"), false, "cualquier otro tipo de evento es rechazado");
assertEqual(isSupportedWompiEvent(undefined), false, "evento ausente es rechazado");

// 3-8. Environment (Ninja #3 — ahora estricto en los tres sentidos: un
// pago real de Sandbox E2E confirmó que el payload real SÍ incluye
// `environment`, así que ausente/null/desconocido se rechazan igual que un
// valor que no coincide — ver nota de auditoría en shared/commercial/wompi.ts).
assertEqual(matchesExpectedWompiEnvironment("test", "sandbox"), true, "sandbox + 'test' es aceptado");
assertEqual(matchesExpectedWompiEnvironment("prod", "sandbox"), false, "sandbox + 'prod' es rechazado");
assertEqual(matchesExpectedWompiEnvironment("prod", "production"), true, "production + 'prod' es aceptado");
assertEqual(matchesExpectedWompiEnvironment("test", "production"), false, "production + 'test' es rechazado");
assertEqual(matchesExpectedWompiEnvironment(undefined, "sandbox"), false, "environment ausente ya no se tolera — rechazado en sandbox");
assertEqual(matchesExpectedWompiEnvironment(null, "production"), false, "environment null ya no se tolera — rechazado en production");
assertEqual(matchesExpectedWompiEnvironment("staging", "sandbox"), false, "environment desconocido (ni 'test' ni 'prod') → rechazado");

// 7-10. Campos mínimos de transaction.
const COMPLETE_TX = { id: "01-tx-1", reference: "sub_ref_1", status: "APPROVED", amount_in_cents: 9999000, currency: "COP" };
assertEqual(getIncompleteWompiTransactionFields(COMPLETE_TX), [], "transacción completa no reporta campos faltantes");
assertEqual(
  getIncompleteWompiTransactionFields({ ...COMPLETE_TX, id: null }),
  ["id"],
  "falta transaction.id → rechazo"
);
assertEqual(
  getIncompleteWompiTransactionFields({ ...COMPLETE_TX, reference: null }),
  ["reference"],
  "falta reference → rechazo"
);
assertEqual(
  getIncompleteWompiTransactionFields({ ...COMPLETE_TX, amount_in_cents: null }),
  ["amount_in_cents"],
  "falta amount_in_cents → rechazo"
);
assertEqual(
  getIncompleteWompiTransactionFields({ ...COMPLETE_TX, currency: null }),
  ["currency"],
  "falta currency → rechazo"
);

// 11-16. Whitelist de statuses.
assertEqual(isSupportedWompiStatus("APPROVED"), true, "status APPROVED soportado");
assertEqual(isSupportedWompiStatus("PENDING"), true, "status PENDING soportado");
assertEqual(isSupportedWompiStatus("DECLINED"), true, "status DECLINED soportado");
assertEqual(isSupportedWompiStatus("VOIDED"), true, "status VOIDED soportado");
assertEqual(isSupportedWompiStatus("ERROR"), true, "status ERROR soportado");
assertEqual(isSupportedWompiStatus("approved"), true, "la whitelist normaliza a mayúsculas antes de comparar");
assertEqual(isSupportedWompiStatus("REFUNDED"), false, "status desconocido (futuro/no documentado) no se procesa comercialmente");
assertEqual(isSupportedWompiStatus(undefined), false, "status ausente no se procesa comercialmente");

// 17-18. Resolución de signature.properties.
const SAMPLE_DATA = { transaction: { id: "01-tx-1", status: "APPROVED", amount_in_cents: 9999000 } };
assertEqual(
  resolveOrderedPropertyValues(SAMPLE_DATA, ["transaction.id", "transaction.status", "transaction.amount_in_cents"]),
  ["01-tx-1", "APPROVED", 9999000],
  "property dinámica válida → valores resueltos en el orden dado, checksum calculable"
);
assertEqual(
  resolveOrderedPropertyValues(SAMPLE_DATA, ["transaction.id", "transaction.nonexistent_field"]),
  null,
  "property irresoluble (undefined) → null, nunca concatenar 'undefined' en el checksum"
);

// 19-20. Checksum, de punta a punta con las funciones reales (sin secretos reales).
{
  const orderedValues = resolveOrderedPropertyValues(SAMPLE_DATA, ["transaction.id", "transaction.status", "transaction.amount_in_cents"])!;
  const checksum = buildEventChecksum({ orderedPropertyValues: orderedValues, timestamp: 1735689600, eventsSecret: "test_events_fixture" });
  assertEqual(checksumsMatch(checksum, checksum), true, "checksum correcto (recalculado igual al recibido) → válido");
  assertEqual(checksumsMatch(checksum, "0".repeat(64)), false, "checksum incorrecto → rechazo");
}

// ─── Pill de suscripción (sidebar OWNER) ───────────────────────────────────
// Cubre la lógica pura (ceil de días, copy/tono por fase) del QA focalizado
// del prompt "Pill de suscripción para OWNER". La visibilidad por rol (OWNER
// real vs. ADMIN/PLAYER/SUPERADMIN elevado) y la navegación al hacer click
// son responsabilidad de [club]/layout.tsx y AppNav/SidebarIdentity — no son
// lógica pura testeable acá; quedan cubiertas por revisión manual/lectura de
// código (ver el reporte de esta tarea).

const PILL_NOW = new Date("2026-06-01T12:00:00Z");

// 21. Trial con más de un día completo restante → días exactos, redondeando
// hacia arriba (ceil), nunca restando un día de más mientras quedan horas.
assertEqual(
  getTrialDaysRemaining(new Date(PILL_NOW.getTime() + 29 * 24 * 60 * 60 * 1000).toISOString(), PILL_NOW),
  29,
  "29 días exactos restantes → 29"
);

// 22. 25 horas restantes → ceil da 2, nunca 1 (floor mostraría un día menos
// de lo que realmente queda).
assertEqual(
  getTrialDaysRemaining(new Date(PILL_NOW.getTime() + 25 * 60 * 60 * 1000).toISOString(), PILL_NOW),
  2,
  "25 horas restantes → ceil da 2 días, no 1 (no restar un día de más)"
);

// 23. Menos de 24 horas restantes → 1 (el "último día", nunca 0 mientras
// trialEndsAt sigue en el futuro).
assertEqual(
  getTrialDaysRemaining(new Date(PILL_NOW.getTime() + 3 * 60 * 60 * 1000).toISOString(), PILL_NOW),
  1,
  "3 horas restantes → 1 (último día)"
);

// 24. trial, días >= 2 → "N días de prueba".
assertEqual(
  getCommercialPillContent({
    status: "trialing",
    trialEndsAt: new Date(PILL_NOW.getTime() + 29 * 24 * 60 * 60 * 1000).toISOString(),
    currentPeriodEnd: null,
    now: PILL_NOW,
  }),
  { label: "29 días de prueba", tone: "warning" },
  "trial con 29 días restantes → '29 días de prueba'"
);

// 25. trial, último día (dentro de las 24hs / ceil = 1) → "Último día de
// prueba" — nunca "1 día de prueba" literal (ver nota junto a
// getCommercialPillContent: ambos casos del prompt describen el mismo rango
// 0-24h y se unifican en esta única copy final).
assertEqual(
  getCommercialPillContent({
    status: "trialing",
    trialEndsAt: new Date(PILL_NOW.getTime() + 3 * 60 * 60 * 1000).toISOString(),
    currentPeriodEnd: null,
    now: PILL_NOW,
  }),
  { label: "Último día de prueba", tone: "warning" },
  "trial con <24h restantes → 'Último día de prueba'"
);

// 26. trial_grace → "Prueba vencida".
assertEqual(
  getCommercialPillContent({
    status: "trialing",
    trialEndsAt: new Date(PILL_NOW.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    currentPeriodEnd: null,
    now: PILL_NOW,
  }),
  { label: "Prueba vencida", tone: "warning" },
  "trial vencido (gracia) → 'Prueba vencida'"
);

// 27. active → "Suscripción activa".
assertEqual(
  getCommercialPillContent({ status: "active", trialEndsAt: null, currentPeriodEnd: "2026-10-01T00:00:00Z", now: PILL_NOW }),
  { label: "Suscripción activa", tone: "success" },
  "active → 'Suscripción activa'"
);

// 28. past_due → "Pago pendiente".
assertEqual(
  getCommercialPillContent({ status: "past_due", trialEndsAt: null, currentPeriodEnd: "2026-05-01T00:00:00Z", now: PILL_NOW }),
  { label: "Pago pendiente", tone: "warning" },
  "past_due → 'Pago pendiente'"
);

// 29. suspended → "Suspendida".
assertEqual(
  getCommercialPillContent({ status: "suspended", trialEndsAt: null, currentPeriodEnd: null, now: PILL_NOW }),
  { label: "Suspendida", tone: "danger" },
  "suspended → 'Suspendida'"
);

// 30-31. no_subscription/unrecognized → null (nunca mostrar el pill).
assertEqual(
  getCommercialPillContent({ status: null, trialEndsAt: null, currentPeriodEnd: null, now: PILL_NOW }),
  null,
  "club legacy sin suscripción (no_subscription) → sin pill"
);
assertEqual(
  getCommercialPillContent({ status: "cancelled", trialEndsAt: null, currentPeriodEnd: null, now: PILL_NOW }),
  null,
  "status sin decisión de producto (cancelled/unrecognized) → sin pill"
);

// ─── Sanitización del payload antes de persistir (Ninja #3) ────────────────
// Fixture con forma real (event/data.transaction/payment_method/signature/
// environment/sent_at/timestamp) más los campos sensibles que la migración
// 00007 nunca debe recibir a partir de ahora — ver la lista explícita en el
// prompt de esta tarea.
const RAW_EVENT_PAYLOAD = {
  event: "transaction.updated",
  environment: "test",
  timestamp: 1735689600,
  sent_at: "2026-06-01T12:00:00.000Z",
  signature: {
    checksum: "abc123checksum",
    properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
  },
  data: {
    transaction: {
      id: "01-tx-real-1",
      status: "APPROVED",
      reference: "sub_ref_real_1",
      amount_in_cents: 9999000,
      currency: "COP",
      created_at: "2026-06-01T11:55:00.000Z",
      finalized_at: "2026-06-01T11:59:00.000Z",
      payment_method_type: "CARD",
      payment_method: {
        type: "CARD",
        installments: 1,
        extra: { brand: "VISA", card_type: "CREDIT", last_four: "4242", bin: "424242" },
        token: "tok_test_sensitive_do_not_persist",
      },
      customer_data: { full_name: "Jugador de prueba", phone_number: "3001234567" },
      customer_email: "jugador@example.com",
      billing_data: { legal_id: "123456789" },
      shipping_address: { address_line_1: "Calle falsa 123" },
      device_data_token: "ddt_sensitive",
      device_id: "dev_sensitive",
      browser_info: { user_agent: "Mozilla/5.0" },
      payment_source_id: "ps_sensitive",
      three_ds_auth: { auth_type: "challenge_v2" },
      unique_code: "uc_sensitive",
      external_identifier: "ext_sensitive",
    },
  },
};

const sanitized = sanitizeWompiEventPayload(RAW_EVENT_PAYLOAD);
const sanitizedJson = JSON.stringify(sanitized);

// 32-39. Conserva exactamente los campos permitidos.
assertEqual(sanitized.event, "transaction.updated", "sanitizer conserva event");
assertEqual(sanitized.environment, "test", "sanitizer conserva environment");
assertEqual(sanitized.timestamp, 1735689600, "sanitizer conserva timestamp");
assertEqual(sanitized.sent_at, "2026-06-01T12:00:00.000Z", "sanitizer conserva sent_at");
assertEqual(
  (sanitized.signature as { checksum?: string })?.checksum,
  "abc123checksum",
  "sanitizer conserva signature.checksum"
);
assertEqual(
  (sanitized.signature as { properties?: string[] })?.properties,
  ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
  "sanitizer conserva signature.properties"
);
{
  const tx = (sanitized.data as { transaction?: Record<string, unknown> })?.transaction;
  assertEqual(
    { id: tx?.id, status: tx?.status, reference: tx?.reference, amount_in_cents: tx?.amount_in_cents, currency: tx?.currency },
    { id: "01-tx-real-1", status: "APPROVED", reference: "sub_ref_real_1", amount_in_cents: 9999000, currency: "COP" },
    "sanitizer conserva id/status/reference/amount_in_cents/currency de transaction"
  );
  assertEqual(
    { created_at: tx?.created_at, finalized_at: tx?.finalized_at, payment_method_type: tx?.payment_method_type },
    { created_at: "2026-06-01T11:55:00.000Z", finalized_at: "2026-06-01T11:59:00.000Z", payment_method_type: "CARD" },
    "sanitizer conserva created_at/finalized_at/payment_method_type de transaction"
  );
  const pm = tx?.payment_method as Record<string, unknown> | undefined;
  assertEqual(
    { type: pm?.type, installments: pm?.installments, extra: pm?.extra },
    { type: "CARD", installments: 1, extra: { brand: "VISA", card_type: "CREDIT", last_four: "4242" } },
    "sanitizer conserva payment_method.type/installments/extra.{brand,card_type,last_four}"
  );
}

// 40. Elimina explícitamente todo lo sensible listado en el prompt — nunca
// aparece ni como clave ni como valor en el JSON sanitizado.
const FORBIDDEN_STRINGS = [
  "customer_data",
  "customer_email",
  "billing_data",
  "shipping_address",
  "device_data_token",
  "device_id",
  "browser_info",
  "payment_source_id",
  "three_ds_auth",
  "unique_code",
  "external_identifier",
  "tok_test_sensitive_do_not_persist", // payment_method.token
  "3001234567", // customer_data.phone_number
  "jugador@example.com", // customer_email
  "424242", // payment_method.extra.bin, no listado como permitido
];
const leaked = FORBIDDEN_STRINGS.filter((needle) => sanitizedJson.includes(needle));
assertEqual(leaked, [], "sanitizer elimina todos los campos/valores sensibles listados");

// 41-42. El checksum sigue validándose contra el payload ORIGINAL, nunca el
// sanitizado. Prueba directa: si `signature.properties` referencia un campo
// que el sanitizador efectivamente elimina (p. ej. un dato sensible), la
// resolución CONTRA EL PAYLOAD SANITIZADO debe fallar (null, irresoluble) —
// mientras que contra el original resuelve normalmente. Esto demuestra que
// route.ts NO PODRÍA validar un checksum real usando el payload sanitizado
// (perdería datos que Wompi sí firmó), así que el orden real del código
// (checksum en el paso 7, sanitizar recién en el paso 11, siempre sobre
// `payload`/`data` originales) no es una casualidad sino la única secuencia
// que funciona — verificado tanto por este test como por lectura directa
// de route.ts.
{
  const propertiesIncludingSensitiveField = ["transaction.id", "transaction.customer_email"];
  const originalValues = resolveOrderedPropertyValues(RAW_EVENT_PAYLOAD.data, propertiesIncludingSensitiveField);
  assertEqual(
    originalValues,
    ["01-tx-real-1", "jugador@example.com"],
    "checksum calculado contra el payload ORIGINAL resuelve customer_email sin problema"
  );
  const sanitizedData = (sanitized.data ?? {}) as Record<string, unknown>;
  const sanitizedValues = resolveOrderedPropertyValues(sanitizedData, propertiesIncludingSensitiveField);
  assertEqual(
    sanitizedValues,
    null,
    "el mismo checksum NO podría calcularse contra el payload sanitizado (customer_email ya no existe) — por eso siempre se calcula antes de sanitizar"
  );
}

// 43. Con las properties reales de este fixture (las tres que sí sobreviven
// la sanitización), el checksum da igual antes/después — confirma que la
// sanitización no corrompe silenciosamente un checksum ya validado que
// solo referencia campos permitidos, el caso normal de producción.
{
  const originalValues = resolveOrderedPropertyValues(RAW_EVENT_PAYLOAD.data, RAW_EVENT_PAYLOAD.signature.properties)!;
  const originalChecksum = buildEventChecksum({
    orderedPropertyValues: originalValues,
    timestamp: RAW_EVENT_PAYLOAD.timestamp,
    eventsSecret: "test_events_fixture",
  });
  const sanitizedData = (sanitized.data ?? {}) as Record<string, unknown>;
  const sanitizedValues = resolveOrderedPropertyValues(sanitizedData, RAW_EVENT_PAYLOAD.signature.properties)!;
  const sanitizedChecksum = buildEventChecksum({
    orderedPropertyValues: sanitizedValues,
    timestamp: RAW_EVENT_PAYLOAD.timestamp,
    eventsSecret: "test_events_fixture",
  });
  assertEqual(
    checksumsMatch(originalChecksum, sanitizedChecksum),
    true,
    "para properties que sí sobreviven la sanitización, el checksum coincide antes/después (caso normal)"
  );
}

// ─── Fase 5 — coherencia ambiente/llaves (fail-fast) ───────────────────────
// Prefijos verificados contra la documentación oficial vigente de Wompi
// (Ambientes y Llaves) en esta misma fase, no asumidos de memoria.
const SANDBOX_KEYS = {
  publicKey: "pub_test_abc123",
  privateKey: "prv_test_abc123",
  integritySecret: "test_integrity_abc123",
  eventsSecret: "test_events_abc123",
};
const PRODUCTION_KEYS = {
  publicKey: "pub_prod_abc123",
  privateKey: "prv_prod_abc123",
  integritySecret: "prod_integrity_abc123",
  eventsSecret: "prod_events_abc123",
};

assertEqual(wompiKeysMatchEnvironment("sandbox", SANDBOX_KEYS), true, "sandbox + llaves de sandbox → coherente");
assertEqual(wompiKeysMatchEnvironment("production", PRODUCTION_KEYS), true, "production + llaves de production → coherente");
assertEqual(
  wompiKeysMatchEnvironment("production", SANDBOX_KEYS),
  false,
  "production + llaves de sandbox → INCOHERENTE (el error de config que esto previene)"
);
assertEqual(
  wompiKeysMatchEnvironment("sandbox", PRODUCTION_KEYS),
  false,
  "sandbox + llaves de production → INCOHERENTE (el error de config inverso)"
);
// Mismatch parcial (solo una de las cuatro llaves con el prefijo
// equivocado) también debe rechazarse — nunca basta con que 3 de 4 coincidan.
assertEqual(
  wompiKeysMatchEnvironment("production", { ...PRODUCTION_KEYS, privateKey: SANDBOX_KEYS.privateKey }),
  false,
  "mismatch parcial (solo privateKey equivocada, Fase 5.1) → también INCOHERENTE"
);
assertEqual(
  wompiKeysMatchEnvironment("production", { ...PRODUCTION_KEYS, eventsSecret: SANDBOX_KEYS.eventsSecret }),
  false,
  "mismatch parcial (solo eventsSecret equivocado) → también INCOHERENTE"
);
assertEqual(
  wompiKeysMatchEnvironment("production", { ...PRODUCTION_KEYS, integritySecret: SANDBOX_KEYS.integritySecret }),
  false,
  "mismatch parcial (solo integritySecret equivocado) → también INCOHERENTE"
);
assertEqual(
  wompiKeysMatchEnvironment("production", { ...PRODUCTION_KEYS, publicKey: SANDBOX_KEYS.publicKey }),
  false,
  "mismatch parcial (solo publicKey equivocada) → también INCOHERENTE"
);

// ─── Fase 5.1 — hardening de identidad de transacción (tests de exploit) ───
// Reproduce exactamente el vulnerability path documentado en el reporte de
// esta fase: `transaction.reference` no está firmado por Wompi, así que un
// evento con checksum válido para id/status/amount_in_cents podría en
// teoría traer un `reference` distinto. compareVerifiedWompiTransaction es
// la función pura que corta esto — se prueba directamente, con fixtures,
// sin necesidad de un checksum real. verifyWompiTransaction (con fetch
// mockeado, nunca una llamada de red real) cubre los fallos de la API
// remota — nunca debe aprobar nada cuando no puede verificar.

const BASE_VERIFIED: VerifiedWompiTransaction = {
  id: "01-real-tx-1",
  reference: "sub_real_reference_1",
  status: "APPROVED",
  amount_in_cents: 9999000,
  currency: "COP",
  payment_method_type: "CARD",
};
const BASE_WEBHOOK = {
  id: "01-real-tx-1",
  reference: "sub_real_reference_1",
  status: "APPROVED",
  amount_in_cents: 9999000,
  currency: "COP",
};

// Caso 1 — reference alterada (EL exploit conceptual que motiva esta fase):
// checksum habría sido válido (id/status/amount_in_cents intactos, que es
// todo lo que Wompi firma), pero Wompi (la fuente autoritativa) dice que la
// transacción real pertenece a OTRA reference — debe rechazarse en firme,
// nunca reintentable (reintentar no cambia una manipulación).
assertEqual(
  compareVerifiedWompiTransaction(BASE_VERIFIED, { ...BASE_WEBHOOK, reference: "sub_attacker_victim_reference" }),
  { ok: false, retryable: false, reason: "reference_mismatch" },
  "Caso 1 — reference alterada → reference_mismatch, NO reintentable, RPC nunca se llamaría"
);

// Caso 2 — transaction id diferente (nunca debería ocurrir con checksum
// válido, ya que id SÍ está firmado — tratado igual de firme que reference).
assertEqual(
  compareVerifiedWompiTransaction(BASE_VERIFIED, { ...BASE_WEBHOOK, id: "01-otra-tx" }),
  { ok: false, retryable: false, reason: "id_mismatch" },
  "Caso 2 — transaction id diferente → id_mismatch, NO reintentable"
);

// Caso 3 — amount diferente (amount_in_cents SÍ está firmado — igual de firme).
assertEqual(
  compareVerifiedWompiTransaction(BASE_VERIFIED, { ...BASE_WEBHOOK, amount_in_cents: 1 }),
  { ok: false, retryable: false, reason: "amount_mismatch" },
  "Caso 3 — amount diferente → amount_mismatch, NO reintentable"
);

// Caso 4 — currency diferente (no firmada, mismo vector que reference).
assertEqual(
  compareVerifiedWompiTransaction(BASE_VERIFIED, { ...BASE_WEBHOOK, currency: "USD" }),
  { ok: false, retryable: false, reason: "currency_mismatch" },
  "Caso 4 — currency diferente → currency_mismatch, NO reintentable"
);

// Caso 5 — status diferente: SÍ está firmado (no es manipulable sin romper
// el checksum), así que un mismatch acá es una carrera de propagación
// legítima entre el envío del webhook y la lectura fresca de la API, nunca
// tratado como intento de manipulación — reintentable.
assertEqual(
  compareVerifiedWompiTransaction({ ...BASE_VERIFIED, status: "DECLINED" }, BASE_WEBHOOK),
  { ok: false, retryable: true, reason: "status_mismatch" },
  "Caso 5 — status diferente (carrera legítima) → status_mismatch, SÍ reintentable"
);

// Caso 12 — evento legítimo APPROVED, todo coincide → ok, el único camino
// que en route.ts continúa hacia la RPC.
assertEqual(
  compareVerifiedWompiTransaction(BASE_VERIFIED, BASE_WEBHOOK),
  { ok: true },
  "Caso 12 — evento legítimo APPROVED, todo coincide → ok (flujo normal preservado)"
);

// Caso 13 — DECLINED legítimo, todo coincide → mismo comportamiento, la
// función no distingue por valor de status mientras coincida.
assertEqual(
  compareVerifiedWompiTransaction({ ...BASE_VERIFIED, status: "DECLINED" }, { ...BASE_WEBHOOK, status: "DECLINED" }),
  { ok: true },
  "Caso 13 — DECLINED legítimo, todo coincide → ok (comportamiento existente preservado)"
);

// ─── Fase 5.1.1 — PENDING también debe verificarse (hallazgo de esta fase) ─
// Encontrado en la auditoría: PENDING no llevaba una suscripción a `active`
// ni creaba un período, pero SÍ escribía provider_transaction_id sobre el
// payment localizado por `reference` (ver el branch `v_normalized_status =
// 'pending'` en process_wompi_transaction_event, 20261115000007, no
// tocado). Un PENDING con `reference` alterada podía "envenenar" el
// provider_transaction_id de OTRO payment con el id real de una
// transacción ajena; al llegar después el evento final legítimo de esa
// misma transacción, el índice único parcial nuevo de 20261115000008
// (provider_transaction_id) lo bloquearía con un unique_violation no
// manejado — dejando el propio pago del atacante atascado en 'pending'
// para siempre (DoS real). La corrección (route.ts) fue quitar el
// special-case que eximía a PENDING de la verificación remota — ahora se
// verifica exactamente igual que un estado final, en el mismo punto.

const PENDING_VERIFIED: VerifiedWompiTransaction = { ...BASE_VERIFIED, status: "PENDING" };
const PENDING_WEBHOOK = { ...BASE_WEBHOOK, status: "PENDING" };

// 1. PENDING con reference alterada (el mismo exploit conceptual, pero
// contra el evento intermedio en vez del final) → debe rechazarse en
// firme, exactamente igual que para un estado final — nunca se llegaría a
// invocar la RPC con esta reference, así que provider_transaction_id de la
// víctima nunca se toca.
assertEqual(
  compareVerifiedWompiTransaction(PENDING_VERIFIED, { ...PENDING_WEBHOOK, reference: "sub_attacker_victim_reference" }),
  { ok: false, retryable: false, reason: "reference_mismatch" },
  "Fase 5.1.1 — PENDING con reference alterada → reference_mismatch, NO reintentable (envenenamiento evitado)"
);

// 4. PENDING legítimo (todo coincide) sigue funcionando — la verificación
// nueva no rompe el camino normal, solo lo protege.
assertEqual(
  compareVerifiedWompiTransaction(PENDING_VERIFIED, PENDING_WEBHOOK),
  { ok: true },
  "Fase 5.1.1 — PENDING legítimo, todo coincide → ok (PENDING real sigue funcionando)"
);

// 2/5. Evento final legítimo posterior a un PENDING (bloqueado o no) sigue
// aprobando con normalidad — misma aserción que el Caso 12, repetida acá
// para dejar explícito que el orden PENDING→APPROVED nunca deja un estado
// intermedio que rompa la verificación del evento final (la función es
// pura y sin memoria entre llamadas: el resultado de esta comparación
// nunca depende de qué PENDING haya llegado antes).
assertEqual(
  compareVerifiedWompiTransaction(BASE_VERIFIED, BASE_WEBHOOK),
  { ok: true },
  "Fase 5.1.1 — evento final legítimo (APPROVED) tras un intento de PENDING envenenado sigue aprobando con normalidad"
);

// 3. Confirmar, por lectura del código real (nunca solo por la lógica
// pura), que no existe ningún camino que invoque la RPC sin pasar primero
// por la verificación — ancla de texto sobre route.ts: el special-case que
// eximía a PENDING ya no existe, y la llamada a process_wompi_transaction_event
// ocurre textualmente DESPUÉS del `if (!comparison.ok)`, nunca antes.
{
  const routePath = join(__dirname, "..", "src", "app", "api", "wompi", "webhook", "route.ts");
  const routeText = readFileSync(routePath, "utf8");

  assertEqual(
    routeText.includes("FINAL_WOMPI_STATUSES"),
    false,
    "3. route.ts ya no exime a ningún status de la verificación remota (special-case eliminado)"
  );

  const comparisonCheckIndex = routeText.indexOf("if (!comparison.ok)");
  const rpcCallIndex = routeText.indexOf('"process_wompi_transaction_event"');
  assertEqual(
    comparisonCheckIndex > -1 && rpcCallIndex > -1 && comparisonCheckIndex < rpcCallIndex,
    true,
    "3. la verificación (if (!comparison.ok)) ocurre textualmente antes de cualquier llamada a la RPC — sin excepción de status"
  );
}

// 6. El exploit original (Caso 1, contra un estado final) sigue bloqueado
// — reconfirmado explícitamente en este bloque de Fase 5.1.1 para dejar
// registrado que ambos hallazgos (estado final y PENDING) están cubiertos
// por el mismo mecanismo, sin regresión entre uno y otro.
assertEqual(
  compareVerifiedWompiTransaction(BASE_VERIFIED, { ...BASE_WEBHOOK, reference: "sub_attacker_victim_reference" }),
  { ok: false, retryable: false, reason: "reference_mismatch" },
  "6. exploit original (reference alterada en estado final) sigue bloqueado tras el fix de Fase 5.1.1"
);

// ─── Casos 6-11 — fallas de la API remota de Wompi (fetch mockeado, nunca
// red real) — verifyWompiTransaction nunca debe devolver ok:true ante
// ninguna de estas fallas, y route.ts nunca llama a la RPC si esto no es ok.
const FAKE_CONFIG: WompiConfig = {
  publicKey: "pub_test_fixture",
  privateKey: "prv_test_fixture",
  integritySecret: "test_integrity_fixture",
  eventsSecret: "test_events_fixture",
  environment: "sandbox",
};

const originalFetch = global.fetch;
function mockFetchOnce(impl: () => Promise<Response> | never) {
  global.fetch = (async () => impl()) as typeof fetch;
}

async function runWompiApiFailureTests() {
  // Caso 6 — timeout (AbortError simulado).
  mockFetchOnce(async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  });
  let result = await verifyWompiTransaction("01-any", FAKE_CONFIG);
  assertEqual(result, { ok: false, reason: "timeout" }, "Caso 6 — timeout de la API → ok:false, nunca aprueba");

  // Caso 7 — 401 de la API (ej. private key inválida/rotada).
  mockFetchOnce(async () => new Response(null, { status: 401 }));
  result = await verifyWompiTransaction("01-any", FAKE_CONFIG);
  assertEqual(result, { ok: false, reason: "http_error", httpStatus: 401 }, "Caso 7 — API responde 401 → ok:false, nunca aprueba");

  // Caso 8 — 404 (transacción no encontrada todavía / id incorrecto).
  mockFetchOnce(async () => new Response(null, { status: 404 }));
  result = await verifyWompiTransaction("01-any", FAKE_CONFIG);
  assertEqual(result, { ok: false, reason: "http_error", httpStatus: 404 }, "Caso 8 — API responde 404 → ok:false, nunca aprueba");

  // Caso 9 — 500 de la API de Wompi.
  mockFetchOnce(async () => new Response(null, { status: 500 }));
  result = await verifyWompiTransaction("01-any", FAKE_CONFIG);
  assertEqual(result, { ok: false, reason: "http_error", httpStatus: 500 }, "Caso 9 — API responde 500 → ok:false, nunca aprueba");

  // Caso 10 — JSON inválido en la respuesta.
  mockFetchOnce(async () => new Response("not-json{{{", { status: 200 }));
  result = await verifyWompiTransaction("01-any", FAKE_CONFIG);
  assertEqual(result, { ok: false, reason: "invalid_json" }, "Caso 10 — respuesta con JSON inválido → ok:false, nunca aprueba");

  // Caso 11 — respuesta incompleta (falta reference, por ejemplo).
  mockFetchOnce(async () => new Response(JSON.stringify({ data: { id: "01-any", status: "APPROVED" } }), { status: 200 }));
  result = await verifyWompiTransaction("01-any", FAKE_CONFIG);
  assertEqual(result, { ok: false, reason: "invalid_shape" }, "Caso 11 — respuesta incompleta (sin reference/amount/currency) → ok:false, nunca aprueba");

  // Camino feliz — confirma que el mock en sí funciona y que una respuesta
  // completa y válida SÍ produce ok:true con los campos esperados.
  mockFetchOnce(
    async () =>
      new Response(
        JSON.stringify({
          data: { id: "01-real-tx-1", reference: "sub_real_reference_1", status: "APPROVED", amount_in_cents: 9999000, currency: "COP", payment_method_type: "CARD" },
        }),
        { status: 200 }
      )
  );
  result = await verifyWompiTransaction("01-real-tx-1", FAKE_CONFIG);
  assertEqual(
    result,
    { ok: true, transaction: BASE_VERIFIED },
    "camino feliz — respuesta completa y válida → ok:true con los campos esperados"
  );

  global.fetch = originalFetch;
}

async function main() {
  await runWompiApiFailureTests();

  // Caso 14 — evento final duplicado: idempotencia sin cambios (ver
  // payment_events_dedup_idx, no tocado por la migración 00008 nueva).
  {
    const paymentsMigrationText = readFileSync(
      join(__dirname, "..", "supabase", "migrations", "20261115000007_commercial_payments.sql"),
      "utf8"
    );
    assertEqual(
      paymentsMigrationText.includes(
        "CREATE UNIQUE INDEX payment_events_dedup_idx\n  ON public.payment_events (provider, provider_transaction_id, status)"
      ),
      true,
      "Caso 14 — payment_events_dedup_idx sigue exactamente igual (idempotencia de eventos intacta)"
    );
    assertEqual(
      paymentsMigrationText.includes("IF v_payment.status IN ('approved', 'declined', 'voided', 'error') THEN"),
      true,
      "Caso 14 — un payment ya finalizado sigue sin reprocesarse (guard de status intacto)"
    );
  }

  // Caso 15 — misma transaction id para dos payments: el índice único
  // parcial nuevo (migración 00008) debe existir con exactamente esta
  // forma. No hay Postgres real en este entorno (ver convención del repo)
  // — ancla de texto + ya validado con libpg-query (parser real de
  // gramática Postgres) que la migración es SQL válido, ver el reporte de
  // esta fase.
  {
    const newMigrationPath = join(__dirname, "..", "supabase", "migrations", "20261115000008_wompi_transaction_identity_hardening.sql");
    const newMigrationText = readFileSync(newMigrationPath, "utf8");
    assertEqual(
      newMigrationText.includes(
        "CREATE UNIQUE INDEX payments_provider_transaction_id_unique_idx\n  ON public.payments (provider_transaction_id)\n  WHERE provider = 'wompi' AND provider_transaction_id IS NOT NULL;"
      ),
      true,
      "Caso 15 — índice único parcial de provider_transaction_id existe con la forma exacta esperada"
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
