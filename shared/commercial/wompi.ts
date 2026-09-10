// Comercial v2 / Fase 3 — Wompi Web Checkout manual (Colombia).
//
// Fuente: documentación oficial vigente de Wompi (docs.wompi.co/en/docs/
// colombia/), consultada en esta misma fase — nunca conocimiento previo ni
// ejemplos antiguos:
//   - Widget & Checkout Web (firma de integridad del checkout)
//   - Events (checksum de webhooks)
//   - Ambientes y llaves (prefijos pub_test_/pub_prod_, etc.)
//
// Fase 5.1 — el Checkout en sí SIGUE sin usar llave privada (Web Checkout
// redirect-based solo necesita public-key + integrity secret, confirmado de
// nuevo contra la documentación vigente). La llave privada (prv_test_/
// prv_prod_) se agrega en esta fase EXCLUSIVAMENTE para la consulta
// server-side GET /v1/transactions/{id} (ver src/lib/wompi/
// verifyTransaction.ts) — nunca para el checkout, nunca al cliente.
//
// Todas las funciones de este archivo son puras (sin I/O, sin `fetch`, sin
// Supabase) para poder probarlas con fixtures reales sin secretos reales —
// ver scripts/test-commercial-payments.ts. Los secretos reales viven solo en
// variables de entorno de servidor (src/lib/wompi/config.ts) y nunca llegan
// a estas funciones más que como un parámetro en tiempo de ejecución —
// nunca hardcodeados, nunca en el cliente.

import { createHash, timingSafeEqual } from "crypto";

// ─── Coherencia de prefijos ambiente/llaves (Fase 5) ───────────────────────
// Protección operacional fail-fast: evita que un error humano de
// configuración (WOMPI_ENVIRONMENT=production con llaves de Sandbox
// copiadas, o viceversa) active un ambiente incoherente sin que nadie lo
// note hasta que un pago real falle o, peor, un evento de un ambiente se
// procese contra el secreto del otro. Prefijos verificados contra la
// documentación oficial vigente de Wompi (Ambientes y Llaves) en esta misma
// fase — nunca asumidos de memoria:
//   Sandbox:    pub_test_ / test_integrity_ / test_events_
//   Production: pub_prod_ / prod_integrity_ / prod_events_
// Función pura — nunca imprime ni devuelve el valor de las llaves, solo un
// booleano. El caller (src/lib/wompi/config.ts) es responsable de no
// loguear el valor real si esto devuelve false.
//
// Fase 5.1 — se agrega privateKey (prv_test_/prv_prod_) a la coherencia: la
// llave privada nueva (usada solo para verificar transacciones server-side,
// nunca en el checkout) debe corresponder al mismo ambiente que las otras
// tres, exactamente con el mismo criterio "todo o nada" — un mismatch en
// CUALQUIERA de las 4 llaves invalida la configuración completa.
const WOMPI_KEY_PREFIXES = {
  sandbox: { publicKey: "pub_test_", privateKey: "prv_test_", integritySecret: "test_integrity_", eventsSecret: "test_events_" },
  production: { publicKey: "pub_prod_", privateKey: "prv_prod_", integritySecret: "prod_integrity_", eventsSecret: "prod_events_" },
} as const;

export function wompiKeysMatchEnvironment(
  environment: "sandbox" | "production",
  keys: { publicKey: string; privateKey: string; integritySecret: string; eventsSecret: string }
): boolean {
  const expected = WOMPI_KEY_PREFIXES[environment];
  return (
    keys.publicKey.startsWith(expected.publicKey) &&
    keys.privateKey.startsWith(expected.privateKey) &&
    keys.integritySecret.startsWith(expected.integritySecret) &&
    keys.eventsSecret.startsWith(expected.eventsSecret)
  );
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// ─── Firma de integridad del checkout ──────────────────────────────────────
// Fórmula documentada (sin expiration-time, que esta fase no usa):
//   SHA256(reference + amountInCents + currency + integritySecret)
// Ninguna otra concatenación, ningún separador. `amountInCents` se recibe ya
// como entero (nunca float — ver shared/commercial/access.ts §3 del prompt:
// "usar integers").
export function buildCheckoutIntegritySignature(params: {
  reference: string;
  amountInCents: number;
  currency: string;
  integritySecret: string;
}): string {
  const { reference, amountInCents, currency, integritySecret } = params;
  return sha256Hex(`${reference}${amountInCents}${currency}${integritySecret}`);
}

// ─── Checksum de eventos (webhook) ──────────────────────────────────────────
// Algoritmo documentado, verificado en dos páginas independientes de la
// documentación oficial (Events / third-party Events):
//   1. tomar los valores de signature.properties EN EL ORDEN dado por ese
//      mismo array del evento — nunca un array fijo hardcodeado acá, ya que
//      Wompi documenta explícitamente que puede variar por evento;
//   2. concatenarlos sin separador;
//   3. concatenar el timestamp del evento (tal cual, como string);
//   4. concatenar el events secret;
//   5. SHA256, comparar en minúsculas contra signature.checksum/X-Event-Checksum.
//
// NOTA DE AUDITORÍA: el ejemplo numérico publicado en la documentación
// ("1234-1610641025-49201" + "APPROVED" + "4490000" + "1530291411" +
// "prod_events_...") no reprodujo, byte a byte, el checksum que la propia
// documentación muestra como resultado, verificado computacionalmente en
// esta misma fase. Los PASOS del algoritmo están corroborados de forma
// idéntica en dos páginas independientes de la documentación oficial — la
// discrepancia parece estar en el ejemplo numérico publicado, no en el
// algoritmo. Recomendado: validar con una transacción real de Sandbox antes
// de confiar en producción (ver QA Sandbox pendiente en el reporte).
//
// `properties` es el objeto ya aplanado con dot-path como key (p. ej.
// {"transaction.id": "...", "transaction.status": "...",
// "transaction.amount_in_cents": 4490000}) — el caller (el endpoint del
// webhook) es responsable de extraer esos valores del payload real usando
// las keys literales que trae signature.properties, nunca asumidas.
export function buildEventChecksum(params: {
  orderedPropertyValues: (string | number)[];
  timestamp: string | number;
  eventsSecret: string;
}): string {
  const { orderedPropertyValues, timestamp, eventsSecret } = params;
  const concatenated = orderedPropertyValues.map((v) => String(v)).join("") + String(timestamp) + eventsSecret;
  return sha256Hex(concatenated);
}

// Comparación en tiempo constante (crypto.timingSafeEqual) — evita que un
// atacante infiera el checksum correcto byte a byte midiendo cuánto tarda
// la comparación (timing attack). Normaliza a minúsculas primero (Wompi
// publica el ejemplo en mayúsculas; el hex de SHA256 no tiene mayúsculas/
// minúsculas canónicas) y valida longitud/forma antes de comparar —
// timingSafeEqual lanza una excepción si los buffers tienen longitudes
// distintas, así que eso se descarta como "no coincide" antes de llegar
// ahí, nunca dejando que la excepción se propague.
export function checksumsMatch(a: string, b: string): boolean {
  const normalizedA = a?.trim().toLowerCase() ?? "";
  const normalizedB = b?.trim().toLowerCase() ?? "";

  if (normalizedA.length === 0 || normalizedA.length !== normalizedB.length) return false;
  if (!/^[0-9a-f]+$/.test(normalizedA) || !/^[0-9a-f]+$/.test(normalizedB)) return false;

  try {
    return timingSafeEqual(Buffer.from(normalizedA, "utf8"), Buffer.from(normalizedB, "utf8"));
  } catch {
    return false;
  }
}

// amount_in_cents siempre como entero — nunca floats (precios ya son
// enteros COP en este proyecto, ver Commercial Subscription Principles).
export function amountInCents(finalPriceCop: number): number {
  return Math.round(finalPriceCop) * 100;
}

// ─── Validaciones del webhook — extraídas de route.ts para que sean lógica
// real, testeable, del mismo archivo que ya se prueba (nunca un espejo
// duplicado en el script de tests) ─────────────────────────────────────────

// Único tipo de evento que este proyecto procesa comercialmente — ver
// route.ts para la razón (nunca inventar soporte para otro).
export const WOMPI_SUPPORTED_EVENT = "transaction.updated";

export function isSupportedWompiEvent(eventType: string | undefined | null): boolean {
  return eventType === WOMPI_SUPPORTED_EVENT;
}

// Whitelist explícita — forward-compatible: un status futuro que Wompi
// todavía no documenta nunca se traduce a un significado inventado.
export const WOMPI_SUPPORTED_STATUSES = ["PENDING", "APPROVED", "DECLINED", "VOIDED", "ERROR"] as const;
export type WompiSupportedStatus = (typeof WOMPI_SUPPORTED_STATUSES)[number];

export function isSupportedWompiStatus(rawStatus: string | undefined | null): boolean {
  if (!rawStatus) return false;
  return (WOMPI_SUPPORTED_STATUSES as readonly string[]).includes(rawStatus.toUpperCase());
}

// Resuelve un path tipo "transaction.id" contra `data` (la raíz que Wompi
// documenta para signature.properties) — nunca contra un array fijo.
export function resolveWompiPath(obj: Record<string, unknown> | undefined, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

// Devuelve null si CUALQUIER property es irresoluble (undefined/null) —
// nunca concatena el string literal "undefined" en el checksum, nunca
// calcula un checksum con datos incompletos.
export function resolveOrderedPropertyValues(
  data: Record<string, unknown> | undefined,
  properties: string[]
): (string | number)[] | null {
  const values: (string | number)[] = [];
  for (const path of properties) {
    const value = resolveWompiPath(data, path);
    if (value === undefined || value === null) return null;
    values.push(value as string | number);
  }
  return values;
}

// NOTA DE AUDITORÍA (Ninja #2, superada por Ninja #3): la nota original acá
// documentaba que la documentación oficial no mostraba `environment` en el
// payload, y por eso la función toleraba su ausencia. Esa incertidumbre ya
// quedó resuelta con un pago real de Sandbox E2E (Ninja #3): el payload real
// SÍ incluye `environment: "test"`. Con el campo confirmado presente en la
// práctica, tolerar su ausencia ya no protege nada y sí abre una superficie
// real: un payload sin `environment` (malformado, o un Wompi futuro que deje
// de enviarlo) pasaría sin esta verificación, dependiendo solo del checksum.
// Ahora es estricta en los tres sentidos — ausente, null, o cualquier valor
// que no sea exactamente el esperado para el ambiente configurado — se
// rechaza. Esto es más estricto que el checksum por sí solo (defensa en
// profundidad), no un reemplazo de él.
export function matchesExpectedWompiEnvironment(
  payloadEnvironment: string | undefined | null,
  configuredEnvironment: "sandbox" | "production"
): boolean {
  const expected = configuredEnvironment === "production" ? "prod" : "test";
  return payloadEnvironment === expected;
}

// ─── Sanitización del payload antes de persistir (Ninja #3) ────────────────
// El checksum y toda validación de firma SIEMPRE deben correr contra el
// payload ORIGINAL, tal cual llega — nunca contra este resultado. Este
// sanitizador solo se aplica DESPUÉS de validar (checksum, environment,
// evento soportado), justo antes de escribir en `payments.raw_response`/
// `payment_events.payload`, para no persistir PII/datos sensibles que Wompi
// incluye en el payload real pero que este proyecto no necesita para
// auditoría (ver CLAUDE.md → Privacy Principles: no exponer más de lo
// necesario). Construye un objeto nuevo campo por campo — nunca copia el
// payload y luego borra claves — así un campo sensible no listado acá jamás
// puede colarse por accidente, ni hoy ni si Wompi agrega uno nuevo mañana.
function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? (value as string[]) : undefined;
}

export function sanitizeWompiEventPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload.data as Record<string, unknown> | undefined;
  const transaction = data?.transaction as Record<string, unknown> | undefined;
  const paymentMethod = transaction?.payment_method as Record<string, unknown> | undefined;
  const extra = paymentMethod?.extra as Record<string, unknown> | undefined;
  const signature = payload.signature as Record<string, unknown> | undefined;
  const rawTimestamp = payload.timestamp;

  const sanitizedPaymentMethod = paymentMethod
    ? {
        type: asString(paymentMethod.type),
        installments: asNumber(paymentMethod.installments),
        extra: extra
          ? {
              brand: asString(extra.brand),
              card_type: asString(extra.card_type),
              last_four: asString(extra.last_four),
            }
          : undefined,
      }
    : undefined;

  const sanitizedTransaction = transaction
    ? {
        id: asString(transaction.id),
        status: asString(transaction.status),
        reference: asString(transaction.reference),
        amount_in_cents: asNumber(transaction.amount_in_cents),
        currency: asString(transaction.currency),
        created_at: asString(transaction.created_at),
        finalized_at: asString(transaction.finalized_at),
        payment_method_type: asString(transaction.payment_method_type),
        payment_method: sanitizedPaymentMethod,
      }
    : undefined;

  return {
    event: asString(payload.event),
    environment: asString(payload.environment),
    timestamp: typeof rawTimestamp === "string" || typeof rawTimestamp === "number" ? rawTimestamp : undefined,
    sent_at: asString(payload.sent_at),
    signature: signature
      ? {
          checksum: asString(signature.checksum),
          properties: asStringArray(signature.properties),
        }
      : undefined,
    data: sanitizedTransaction ? { transaction: sanitizedTransaction } : undefined,
  };
}

// Campos mínimos de `data.transaction` requeridos antes de invocar
// process_wompi_transaction_event — nunca deja que provider_transaction_id
// llegue undefined/null a la RPC. Devuelve la lista de campos faltantes
// (vacía = transacción completa).
export function getIncompleteWompiTransactionFields(transaction: {
  id?: string | null;
  reference?: string | null;
  status?: string | null;
  amount_in_cents?: number | null;
  currency?: string | null;
}): string[] {
  const missing: string[] = [];
  if (!transaction.id) missing.push("id");
  if (!transaction.reference) missing.push("reference");
  if (!transaction.status) missing.push("status");
  if (transaction.amount_in_cents == null) missing.push("amount_in_cents");
  if (!transaction.currency) missing.push("currency");
  return missing;
}

// ─── Verificación server-side de la transacción real (Fase 5.1) ───────────
// HALLAZGO que motiva esto: verificado contra la documentación oficial
// vigente de Wompi (Events) que `signature.properties` de un evento
// `transaction.updated` real es `[transaction.id, transaction.status,
// transaction.amount_in_cents]` — `transaction.reference` (y `currency`)
// NO están firmados. El webhook usa `reference` para decidir a qué
// `payments` row aplicar la transición; como no está firmado, alguien con
// CUALQUIER evento propio válidamente firmado podría en teoría alterar solo
// el campo `reference` (dejando id/status/amount_in_cents intactos, que es
// todo lo que el checksum protege) y así apuntar la aprobación a la
// suscripción de OTRO club. GET /v1/transactions/{id} (documentado,
// requiere llave privada) es la única fuente verdaderamente autoritativa —
// se consulta usando el `id` YA validado por checksum, nunca el `reference`
// del payload, y su respuesta es lo único que decide si se procede.
//
// Hosts confirmados contra la documentación oficial: Production es
// "production.wompi.co" (ejemplo verbatim en la documentación de
// Transacciones). Sandbox: la documentación de Transacciones solo muestra
// el ejemplo de Production, pero "sandbox.wompi.co" está confirmado como el
// host Sandbox real de esta misma familia de API (mismo dominio ya usado
// para GET /v1/payment_sources/{id}, documentado explícitamente, y la
// propia documentación de Ambientes confirma que "el único cambio es la
// URL base" entre ambientes para una API con idéntica forma) — no un host
// inventado, pero si Alex hace la primera verificación real y este host no
// responde como se espera, es el primer punto a revisar.
export const WOMPI_TRANSACTION_HOSTS = {
  sandbox: "https://sandbox.wompi.co",
  production: "https://production.wompi.co",
} as const;

export interface VerifiedWompiTransaction {
  id: string;
  reference: string;
  status: string;
  amount_in_cents: number;
  currency: string;
  payment_method_type: string | null;
}

export interface WompiWebhookTransactionClaim {
  id: string;
  reference: string;
  status: string;
  amount_in_cents: number;
  currency: string;
}

export type WompiTransactionVerificationOutcome =
  | { ok: true }
  // retryable=true → la causa más probable es una carrera de propagación
  // (ej. status), no manipulación — responder con un HTTP que Wompi
  // reintente (ver route.ts) en vez de un rechazo definitivo.
  | { ok: false; retryable: boolean; reason: string };

// Comparación pura — nunca decide sola qué HTTP status devolver (eso es de
// route.ts), solo el resultado y si tiene sentido reintentar.
//
// id/amount_in_cents SÍ están firmados en el webhook (signature.properties
// real observado) — un mismatch acá indicaría un problema grave (nunca
// debería ocurrir para un evento con checksum válido), así que nunca se
// trata como reintentable. reference/currency NO están firmados — un
// mismatch acá es exactamente el vector de ataque que esto previene, nunca
// reintentable tampoco (reintentar no arregla un intento de manipulación).
// status SÍ está firmado, pero a diferencia de id/amount_in_cents es el
// campo más propenso a una carrera legítima de "eventual consistency" del
// lado de Wompi entre el envío del webhook y la lectura fresca vía API —
// mismatch de status se trata como reintentable, nunca como manipulación.
export function compareVerifiedWompiTransaction(
  verified: VerifiedWompiTransaction,
  webhook: WompiWebhookTransactionClaim
): WompiTransactionVerificationOutcome {
  if (verified.id !== webhook.id) return { ok: false, retryable: false, reason: "id_mismatch" };
  if (verified.reference !== webhook.reference) return { ok: false, retryable: false, reason: "reference_mismatch" };
  if (verified.amount_in_cents !== webhook.amount_in_cents) return { ok: false, retryable: false, reason: "amount_mismatch" };
  if (verified.currency !== webhook.currency) return { ok: false, retryable: false, reason: "currency_mismatch" };
  if (verified.status !== webhook.status) return { ok: false, retryable: true, reason: "status_mismatch" };
  return { ok: true };
}
