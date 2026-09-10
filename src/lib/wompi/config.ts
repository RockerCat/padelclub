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
// No se pide/usa ninguna llave privada (prv_test_/prv_prod_): confirmado
// contra la documentación oficial vigente de Wompi (Ambientes y Llaves)
// que Web Checkout redirect-based solo necesita la llave pública y el
// integrity secret del lado servidor — la llave privada es exclusiva de
// integraciones API directas, fuera de alcance de esta fase.
export interface WompiConfig {
  publicKey: string;
  integritySecret: string;
  eventsSecret: string;
  environment: "sandbox" | "production";
}

// El checkout de Wompi vive en el mismo dominio para ambos ambientes — el
// ambiente real lo determina el prefijo de la llave usada (pub_test_ vs
// pub_prod_), nunca una URL distinta (confirmado contra la documentación
// oficial de Widget & Checkout Web).
export const WOMPI_CHECKOUT_URL = "https://checkout.wompi.co/p/";

export function getWompiConfig(): WompiConfig | null {
  const publicKey = process.env.WOMPI_PUBLIC_KEY;
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
  const eventsSecret = process.env.WOMPI_EVENTS_SECRET;
  const rawEnvironment = process.env.WOMPI_ENVIRONMENT;

  if (!publicKey || !integritySecret || !eventsSecret) return null;

  const environment: "sandbox" | "production" = rawEnvironment === "production" ? "production" : "sandbox";

  return { publicKey, integritySecret, eventsSecret, environment };
}
