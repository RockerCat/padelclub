// Comercial v2 / Fase 3 — configuración de Wompi, server-only. Nunca se
// hardcodea ninguna llave/secreto acá; todo viene de variables de entorno
// (ver PROJECT_STATUS.md → Comercial v2 — Fase 3 para la lista completa
// que Alex debe configurar en Vercel/`.env.local`). Ninguna de estas
// variables tiene prefijo NEXT_PUBLIC_ a propósito: incluso la llave
// pública de Wompi se resuelve server-side (Server Action) e inyecta como
// valor de un input oculto ya renderizado, nunca importada en código de
// cliente — así puede rotarse sin rebuild y nunca queda embebida en el
// bundle de JS.
//
// Fase 5.1 — se agrega WOMPI_PRIVATE_KEY (prv_test_/prv_prod_). El Checkout
// en sí SIGUE sin usarla (Web Checkout redirect-based solo necesita la
// llave pública y el integrity secret, confirmado de nuevo contra la
// documentación oficial vigente) — esta llave es exclusivamente para
// GET /v1/transactions/{id} server-side (ver verifyTransaction.ts), la
// verificación obligatoria antes de aprobar/rechazar un pago (ver
// shared/commercial/wompi.ts para el porqué). Nunca se envía a
// CheckoutForm, nunca a ningún Client Component, nunca se loguea, nunca se
// persiste en DB, nunca aparece en una respuesta de API.
import { wompiKeysMatchEnvironment } from "../../../shared/commercial/wompi";

export interface WompiConfig {
  publicKey: string;
  privateKey: string;
  integritySecret: string;
  eventsSecret: string;
  environment: "sandbox" | "production";
}

// El checkout de Wompi vive en el mismo dominio para ambos ambientes — el
// ambiente real lo determina el prefijo de la llave usada (pub_test_ vs
// pub_prod_), nunca una URL distinta (confirmado contra la documentación
// oficial de Widget & Checkout Web).
export const WOMPI_CHECKOUT_URL = "https://checkout.wompi.co/p/";

// Fase 5 — fail-fast de coherencia ambiente/llaves: si WOMPI_ENVIRONMENT no
// coincide con el prefijo real de las llaves configuradas (p. ej.
// production + llaves de Sandbox copiadas por error, o viceversa), esto
// devuelve null exactamente igual que "no configurado" — reutiliza el
// mismo camino de fail-closed que cada caller ya maneja (503/mensaje
// genérico), sin necesidad de un nuevo tipo de error en ningún llamador.
// El log explica QUÉ pasó sin imprimir ningún valor de llave.
//
// Fase 5.1 — WOMPI_PRIVATE_KEY ahora es requerida acá igual que las otras
// tres: su ausencia hace que TODO (checkout Y webhook) responda 503 "no
// configurado", nunca que el webhook procese pagos sin poder verificarlos
// (fail-closed, nunca fail-open). Efecto deliberado sobre el deployment
// actual: Production hoy NO tiene esta variable — hasta que Alex la
// configure en Vercel, un redeploy de este cambio deja checkout/webhook
// deshabilitados por diseño, nunca funcionando sin la verificación nueva.
export function getWompiConfig(): WompiConfig | null {
  const publicKey = process.env.WOMPI_PUBLIC_KEY;
  const privateKey = process.env.WOMPI_PRIVATE_KEY;
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
  const eventsSecret = process.env.WOMPI_EVENTS_SECRET;
  const rawEnvironment = process.env.WOMPI_ENVIRONMENT;

  if (!publicKey || !privateKey || !integritySecret || !eventsSecret) return null;

  const environment: "sandbox" | "production" = rawEnvironment === "production" ? "production" : "sandbox";

  if (!wompiKeysMatchEnvironment(environment, { publicKey, privateKey, integritySecret, eventsSecret })) {
    console.error(
      `[wompi config] WOMPI_ENVIRONMENT="${environment}" no coincide con el prefijo de las llaves configuradas — configuración rechazada por seguridad. Verifica WOMPI_PUBLIC_KEY/WOMPI_PRIVATE_KEY/WOMPI_INTEGRITY_SECRET/WOMPI_EVENTS_SECRET en Vercel (nunca se imprime el valor de ninguna llave).`
    );
    return null;
  }

  return { publicKey, privateKey, integritySecret, eventsSecret, environment };
}
