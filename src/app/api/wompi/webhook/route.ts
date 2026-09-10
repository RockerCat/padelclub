import { NextResponse, type NextRequest } from "next/server";
import { getWompiConfig } from "@/lib/wompi/config";
import { verifyWompiTransaction } from "@/lib/wompi/verifyTransaction";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildEventChecksum,
  checksumsMatch,
  compareVerifiedWompiTransaction,
  getIncompleteWompiTransactionFields,
  isSupportedWompiEvent,
  isSupportedWompiStatus,
  matchesExpectedWompiEnvironment,
  resolveOrderedPropertyValues,
  sanitizeWompiEventPayload,
} from "../../../../../shared/commercial/wompi";

// Comercial v2 / Fase 3 — endpoint del webhook de Wompi. Configurar en el
// dashboard de Wompi como la URL de eventos (ver PROJECT_STATUS.md →
// Comercial v2 — Fase 3 para el paso a paso completo que Alex debe hacer).
//
// Esta es la ÚNICA fuente de verdad de un pago — el redirect del navegador
// (payment-result/page.tsx) nunca activa nada por sí mismo (confirmado
// contra la documentación oficial vigente de Wompi: "transaction queries
// from the frontend are no longer supported").
//
// Solo procesa comercialmente `transaction.updated` — nunca inventa soporte
// para otro tipo de evento. Nunca invoca process_wompi_transaction_event
// antes de validar el checksum con el events secret (server-only, jamás
// expuesto). Usa el cliente service_role — la única forma de invocar esa
// RPC, cerrada a cualquier rol de cliente — porque Wompi llama este
// endpoint sin ninguna sesión de Supabase.
//
// Todas las validaciones reutilizables (evento soportado, whitelist de
// status, resolución de signature.properties, environment) viven como
// funciones puras exportadas en shared/commercial/wompi.ts — lo mismo que
// scripts/test-commercial-payments.ts prueba directamente, nunca un espejo
// duplicado aquí ni allá.
//
// Fase 5.1 — el checksum válido por sí solo YA NO es suficiente para
// invocar la RPC con ningún status: `transaction.reference` no forma parte
// de `signature.properties` según la documentación oficial vigente de
// Wompi, así que antes de llamar a process_wompi_transaction_event se
// consulta GET /v1/transactions/{id} (verifyWompiTransaction, usando el
// `id` ya validado por checksum) y se compara la respuesta autoritativa
// contra lo que el webhook afirma — ver el punto 10 más abajo y la nota
// completa en shared/commercial/wompi.ts.
//
// Fase 5.1.1 — esto se aplica a TODOS los statuses soportados, incluido
// PENDING, sin excepción: aunque PENDING nunca activa una suscripción ni
// crea un período, SÍ escribe provider_transaction_id sobre el payment
// localizado por `reference` (ver el branch `v_normalized_status =
// 'pending'` en process_wompi_transaction_event). Un PENDING con
// `reference` alterada podía "envenenar" el provider_transaction_id de OTRO
// payment con el id real de una transacción ajena — inofensivo por sí solo,
// pero al llegar después el evento final legítimo de esa misma transacción,
// el índice único parcial de 20261115000008 (provider_transaction_id) lo
// bloquearía con un unique_violation no manejado, dejando el pago legítimo
// del propio atacante atascado en 'pending' para siempre (DoS real,
// encontrado en la auditoría de esta fase). Verificar también PENDING
// cierra esto en el mismo punto que ya cierra los estados finales, sin
// tocar SQL ni introducir un segundo mecanismo.
export async function POST(req: NextRequest) {
  // 1. Configuración de Wompi disponible.
  const wompiConfig = getWompiConfig();
  if (!wompiConfig) {
    console.error("[wompi webhook] Wompi no está configurado (faltan variables de entorno)");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // 2. JSON válido.
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 3. Estructura mínima de signature/data.
  const signature = payload?.signature as { properties?: string[]; checksum?: string } | undefined;
  const timestamp = payload?.timestamp as string | number | undefined;
  const data = payload?.data as Record<string, unknown> | undefined;
  const transaction = data?.transaction as Record<string, unknown> | undefined;

  if (!signature?.properties?.length || !signature?.checksum || timestamp == null || !transaction) {
    console.error("[wompi webhook] payload mal formado — falta signature/timestamp/data.transaction");
    return NextResponse.json({ error: "malformed_payload" }, { status: 400 });
  }

  // 4. Evento soportado — únicamente transaction.updated. Cualquier otro
  // tipo de evento se registra y se descarta sin tocar payments/
  // subscription_periods/club_subscriptions.
  const eventType = payload?.event as string | undefined;
  if (!isSupportedWompiEvent(eventType)) {
    console.log("[wompi webhook] evento no soportado, ignorado sin procesar:", eventType);
    return NextResponse.json({ received: true, processed: false, reason: "unsupported_event" }, { status: 200 });
  }

  // 5. Environment — estricto en los tres sentidos (ausente, null, o valor
  // que no coincida), ver la nota de auditoría junto a
  // matchesExpectedWompiEnvironment en shared/commercial/wompi.ts: un pago
  // real de Sandbox E2E confirmó que el payload real SÍ incluye
  // `environment` ("test"), así que ya no hay razón para tolerar su
  // ausencia. Defensa en profundidad sobre el checksum, no un reemplazo.
  const payloadEnvironment = payload?.environment as string | undefined;
  if (!matchesExpectedWompiEnvironment(payloadEnvironment, wompiConfig.environment)) {
    console.error("[wompi webhook] environment del evento no coincide con WOMPI_ENVIRONMENT — rechazado", {
      configured: wompiConfig.environment,
      received: payloadEnvironment,
    });
    return NextResponse.json({ error: "environment_mismatch" }, { status: 400 });
  }

  // 6. Resolver signature.properties dinámicamente — nunca un array fijo.
  // Si cualquier path resuelve a undefined/null, el payload se trata como
  // malformado: nunca se concatena "undefined" ni se calcula un checksum
  // con datos incompletos.
  const orderedPropertyValues = resolveOrderedPropertyValues(data, signature.properties);
  if (orderedPropertyValues === null) {
    console.error("[wompi webhook] signature.properties trae al menos un path irresoluble — payload rechazado");
    return NextResponse.json({ error: "unresolvable_signature_property" }, { status: 400 });
  }

  // 7. Checksum — nunca procesar comercialmente antes de este punto.
  const computedChecksum = buildEventChecksum({
    orderedPropertyValues,
    timestamp,
    eventsSecret: wompiConfig.eventsSecret,
  });

  // Header y campo del body son equivalentes según la documentación oficial
  // vigente ("we provide them in both places for convenience, so you are
  // free to extract it from either one") — sin orden de autoridad
  // documentado entre ambos. Se mantiene la preferencia por el header ya
  // existente, con el campo del body como fallback — comportamiento
  // confirmado válido, sin cambio de fuente.
  const receivedChecksum = req.headers.get("x-event-checksum") ?? signature.checksum;

  if (!checksumsMatch(computedChecksum, receivedChecksum)) {
    console.error("[wompi webhook] checksum inválido — evento rechazado sin procesar");
    return NextResponse.json({ error: "invalid_checksum" }, { status: 401 });
  }

  // 8. Campos mínimos de transaction, ya con la firma validada.
  const reference = transaction.reference as string | undefined;
  const providerTransactionId = transaction.id as string | undefined;
  const rawStatus = transaction.status as string | undefined;
  const amountInCentsValue = transaction.amount_in_cents as number | undefined;
  const currency = transaction.currency as string | undefined;
  const paymentMethod = (transaction.payment_method_type as string | undefined) ?? null;

  const missingFields = getIncompleteWompiTransactionFields({
    id: providerTransactionId,
    reference,
    status: rawStatus,
    amount_in_cents: amountInCentsValue,
    currency,
  });
  if (missingFields.length > 0 || !providerTransactionId || !reference || !rawStatus || amountInCentsValue == null || !currency) {
    // La segunda mitad de esta condición es redundante con
    // getIncompleteWompiTransactionFields en tiempo de ejecución — existe
    // solo para que TypeScript pueda estrechar estos valores a `string`/
    // `number` de aquí en adelante, sin un cast inseguro.
    console.error("[wompi webhook] transaction incompleta tras validar firma — faltan:", missingFields);
    return NextResponse.json({ error: "incomplete_transaction" }, { status: 400 });
  }

  // 9. Whitelist explícita de statuses — forward-compatible: un status
  // futuro que Wompi todavía no documenta nunca se traduce a un
  // significado inventado (nunca se convierte a 'error', nunca activa,
  // nunca crea período, nunca finaliza el intento). Se registra y se
  // responde de forma segura, sin invocar la RPC en absoluto.
  if (!isSupportedWompiStatus(rawStatus)) {
    console.error("[wompi webhook] status desconocido, evento no procesado comercialmente:", rawStatus);
    return NextResponse.json({ received: true, processed: false, reason: "unsupported_status" }, { status: 200 });
  }
  const status = rawStatus.toUpperCase();

  // 10. Verificación server-side OBLIGATORIA antes de invocar la RPC, para
  // TODO status soportado incluido PENDING (Fase 5.1.1 — ver la nota de
  // cabecera de este archivo para el porqué). Se consulta
  // GET /v1/transactions/{id} usando el `id` YA validado por checksum
  // (nunca el reference) y se compara la respuesta autoritativa contra lo
  // que el webhook afirma. Ningún camino de código llega a invocar la RPC
  // sin pasar por esto primero — si la verificación falla o no coincide, se
  // corta acá, antes de que provider_transaction_id pueda escribirse sobre
  // cualquier fila.
  const verifyResult = await verifyWompiTransaction(providerTransactionId, wompiConfig);

  if (!verifyResult.ok) {
    // Nunca fail-open: sin importar la razón (timeout, red, HTTP no-2xx,
    // JSON inválido, forma inesperada), si no podemos verificar, no se
    // procesa. 502 — nunca un 2xx — para que Wompi reintente el webhook más
    // tarde (documentado: reintenta hasta 3 veces en 24h ante cualquier
    // respuesta que no sea 200), dándole otra oportunidad a esta
    // verificación una vez que la API de Wompi (o nuestra red) se
    // recupere. Nunca se loguea el private key ni el body de la respuesta
    // — solo la razón/status HTTP.
    console.error("[wompi webhook] no se pudo verificar la transacción contra la API de Wompi — rechazada sin procesar", {
      reason: verifyResult.reason,
      httpStatus: "httpStatus" in verifyResult ? verifyResult.httpStatus : undefined,
    });
    return NextResponse.json({ error: "verification_unavailable" }, { status: 502 });
  }

  const comparison = compareVerifiedWompiTransaction(verifyResult.transaction, {
    id: providerTransactionId,
    reference,
    status,
    amount_in_cents: amountInCentsValue,
    currency,
  });

  if (!comparison.ok) {
    // reference_mismatch es exactamente el vector que esto existe para
    // prevenir (incluido para PENDING, ver Fase 5.1.1) — nunca se llama a
    // la RPC, nunca se toca payments/club_subscriptions. status_mismatch es
    // la única razón tratada como reintentable (carrera de propagación
    // legítima, no manipulación — ver la nota junto a
    // compareVerifiedWompiTransaction); el resto (id/amount/currency) nunca
    // debería ocurrir para un evento con checksum válido, así que se
    // rechaza en firme.
    console.error("[wompi webhook] la transacción verificada con Wompi no coincide con el evento del webhook — rechazada sin procesar", {
      reason: comparison.reason,
    });
    return NextResponse.json({ error: comparison.reason }, { status: comparison.retryable ? 502 : 409 });
  }

  // 11. Cliente admin (service_role) — única forma de invocar la RPC.
  const admin = createAdminClient();
  if (!admin) {
    console.error("[wompi webhook] SUPABASE_SERVICE_ROLE_KEY no configurada");
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  // 12. Sanitizar recién acá — después de validar checksum/environment/
  // evento/status/verificación remota contra el payload ORIGINAL (arriba,
  // sin excepción). Lo único que se persiste en payments.raw_response/
  // payment_events.payload es esta versión reducida — nunca el body
  // completo de Wompi ni la respuesta de verifyWompiTransaction (que
  // tampoco se persiste en absoluto, solo se usa para comparar en memoria y
  // se descarta) — ver sanitizeWompiEventPayload en shared/commercial/wompi.ts.
  const sanitizedPayload = sanitizeWompiEventPayload(payload);

  // 13. process_wompi_transaction_event added in 20261115000007, not yet
  // in generated types until `npm run types:generate` runs against a DB
  // with this migration applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.rpc as any)("process_wompi_transaction_event", {
    p_reference: reference,
    p_provider_transaction_id: providerTransactionId,
    p_status: status,
    p_amount_in_cents: amountInCentsValue,
    p_currency: currency,
    p_raw_payload: sanitizedPayload,
    p_checksum: signature.checksum,
    p_payment_method: paymentMethod,
  });

  if (error) {
    console.error("[wompi webhook] process_wompi_transaction_event falló:", error);
    // 5xx a propósito — esto sí debe reintentarse (fallo transitorio de
    // DB), a diferencia de un checksum inválido o un payload mal formado.
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true, processed: true }, { status: 200 });
}
