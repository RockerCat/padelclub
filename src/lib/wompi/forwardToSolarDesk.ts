// Wompi comercio compartido con SolarDesk — reenvío delgado de un evento
// que ya se determinó (por su `reference`, ver isSolarDeskWompiReference en
// shared/commercial/wompi.ts) que le pertenece a SolarDesk, no a Mi Pádel
// Club. Reenvía el body ORIGINAL, sin tocar ni un byte — nunca el payload
// sanitizado que este proyecto persiste en su propio payment_events, y
// nunca un payload reconstruido a mano.
//
// Deliberadamente SIN secreto interno nuevo entre este endpoint y
// SolarDesk: el checksum de Wompi (validado por route.ts ANTES de llegar
// hasta aquí, con el mismo WOMPI_EVENTS_SECRET que ambas apps comparten
// por ser el mismo comercio) ya es la única autenticación real posible —
// nadie sin ese secreto puede producir un payload con checksum válido, así
// que inventar un segundo secreto de "forwarding" no añadiría seguridad
// real, solo un secreto más para rotar/filtrar. SolarDesk valida ese mismo
// checksum de nuevo, de forma completamente independiente
// (validateWompiEventSignature en su propio src/lib/wompi.ts) — su
// verificación Wompi nunca se debilita ni se saltea por venir de este
// reenvío en vez de directamente de Wompi.
export interface ForwardToSolarDeskResult {
  httpStatus: number;
  body: Record<string, unknown>;
}

const FORWARD_TIMEOUT_MS = 10_000;

// Nombre de la variable de entorno — nunca un valor hardcodeado. Debe
// configurarse en el deployment de Mi Pádel Club (Vercel/`.env.local`)
// apuntando al webhook REAL de SolarDesk para el ambiente correspondiente
// (Sandbox: su deployment de prueba; Producción: https://solardesk.co/api/webhooks/wompi).
// No es un secreto (es una URL pública, la misma que Wompi ya llamaría
// directamente), pero igual vive en variable de entorno — no hardcodeada —
// porque difiere entre Sandbox y Producción.
const SOLARDESK_WEBHOOK_URL_ENV = "SOLARDESK_WOMPI_WEBHOOK_URL";

export async function forwardWompiEventToSolarDesk(
  rawPayload: unknown
): Promise<ForwardToSolarDeskResult> {
  const url = process.env[SOLARDESK_WEBHOOK_URL_ENV];
  if (!url) {
    console.error(
      `[wompi webhook] ${SOLARDESK_WEBHOOK_URL_ENV} no está configurada — evento de SolarDesk no se pudo reenviar`
    );
    return { httpStatus: 502, body: { error: "solardesk_forward_not_configured" } };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rawPayload),
      signal: controller.signal,
    });

    // Relayed verbatim — Wompi debe ver exactamente lo que SolarDesk decidió
    // (200/400/401/409/500...), nunca un 200 fijo que oculte un fallo real
    // del destino y le impida a Wompi reintentar cuando corresponde.
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { httpStatus: res.status, body };
  } catch (err) {
    // Nunca se loguea el body del evento ni ningún secreto — solo la razón
    // de la falla de red/timeout, igual que el resto de este módulo.
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? "timeout"
        : err instanceof Error
          ? err.message
          : "unknown_error";
    console.error("[wompi webhook] no se pudo reenviar el evento a SolarDesk", { reason });
    // 502 — retryable — nunca fail-open: si no pudimos confirmar que
    // SolarDesk recibió el evento, Wompi debe reintentar más tarde.
    return { httpStatus: 502, body: { error: "solardesk_forward_unavailable" } };
  } finally {
    clearTimeout(timeoutId);
  }
}
