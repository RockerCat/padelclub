import { NextResponse, type NextRequest } from "next/server";
import { getWompiConfig } from "@/lib/wompi/config";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildEventChecksum,
  checksumsMatch,
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

  // 10. Cliente admin (service_role) — única forma de invocar la RPC.
  const admin = createAdminClient();
  if (!admin) {
    console.error("[wompi webhook] SUPABASE_SERVICE_ROLE_KEY no configurada");
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  // 11. Sanitizar recién acá — después de validar checksum/environment/
  // evento/status contra el payload ORIGINAL (arriba, sin excepción). Lo
  // único que se persiste en payments.raw_response/payment_events.payload
  // es esta versión reducida — nunca el body completo de Wompi, que trae
  // PII y datos de pago que este proyecto no necesita para auditoría (ver
  // sanitizeWompiEventPayload en shared/commercial/wompi.ts).
  const sanitizedPayload = sanitizeWompiEventPayload(payload);

  // 12. process_wompi_transaction_event added in 20261115000007, not yet
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
