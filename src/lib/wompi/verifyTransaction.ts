// Comercial v2 / Fase 5.1 — cliente server-side mínimo para
// GET /v1/transactions/{id}, la fuente autoritativa que el webhook consulta
// antes de aprobar/rechazar/anular/errorar un pago de forma definitiva (ver
// shared/commercial/wompi.ts para el hallazgo completo que motiva esto:
// `transaction.reference` no forma parte de `signature.properties`, así que
// no puede tratarse como criptográficamente vinculado al resto del evento
// solo porque el checksum general sea válido).
//
// Hosts confirmados contra la documentación oficial de Wompi (Transacciones/
// Ambientes) — ver la nota completa junto a WOMPI_TRANSACTION_HOSTS en
// shared/commercial/wompi.ts. Auth: `Authorization: Bearer <private key>`,
// exactamente como documenta Wompi (nunca la llave pública para esto — la
// documentación vigente confirma que un request con solo la llave pública
// ya no es soportado y responde 404).
//
// fetch nativo — no se introduce ningún SDK para una sola llamada GET.
import { WOMPI_TRANSACTION_HOSTS, type VerifiedWompiTransaction } from "../../../shared/commercial/wompi";
import type { WompiConfig } from "./config";

const VERIFY_TIMEOUT_MS = 8000;

export type VerifyWompiTransactionResult =
  | { ok: true; transaction: VerifiedWompiTransaction }
  | { ok: false; reason: "timeout" | "network_error" | "http_error" | "invalid_json" | "invalid_shape"; httpStatus?: number };

// Nunca lanza — todo fallo (timeout, red, HTTP no-2xx, JSON inválido, forma
// inesperada) se devuelve como { ok: false }, nunca como excepción, para que
// el caller (route.ts) tenga un único camino de manejo de errores y nunca
// se le escape una excepción no capturada justo antes de decidir si aprobar
// un pago. Nunca loguea el private key ni el body completo de la respuesta
// — el caller decide qué loguear (solo `reason`/`httpStatus`).
export async function verifyWompiTransaction(
  transactionId: string,
  config: WompiConfig
): Promise<VerifyWompiTransactionResult> {
  const host = WOMPI_TRANSACTION_HOSTS[config.environment];
  const url = `${host}/v1/transactions/${encodeURIComponent(transactionId)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.privateKey}` },
      signal: controller.signal,
      // Nunca cachear una consulta de estado de pago.
      cache: "no-store",
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") return { ok: false, reason: "timeout" };
    return { ok: false, reason: "network_error" };
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    return { ok: false, reason: "http_error", httpStatus: response.status };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  // Forma documentada: { data: { id, reference, status, amount_in_cents,
  // currency, payment_method_type, ... } }. Nunca se confía en campos
  // adicionales — solo se extraen los 5 usados para comparar más
  // payment_method_type (informativo, nunca comparado).
  const data = (body as { data?: unknown } | null)?.data;
  if (!data || typeof data !== "object") return { ok: false, reason: "invalid_shape" };

  const d = data as Record<string, unknown>;
  if (
    typeof d.id !== "string" ||
    typeof d.reference !== "string" ||
    typeof d.status !== "string" ||
    typeof d.amount_in_cents !== "number" ||
    typeof d.currency !== "string"
  ) {
    return { ok: false, reason: "invalid_shape" };
  }

  return {
    ok: true,
    transaction: {
      id: d.id,
      reference: d.reference,
      status: d.status,
      amount_in_cents: d.amount_in_cents,
      currency: d.currency,
      payment_method_type: typeof d.payment_method_type === "string" ? d.payment_method_type : null,
    },
  };
}
