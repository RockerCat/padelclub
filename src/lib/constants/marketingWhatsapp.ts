// Único número/mensaje de WhatsApp de ventas usado en toda la landing
// (Hero, Audience, WhatsAppSupport) — antes duplicado como una constante
// local `WA_URL` en cada componente; centralizado aquí para que un cambio
// de número o de mensaje nunca requiera tocar más de un archivo. Nunca el
// WhatsApp de un jugador/club dentro de la app (ese es un dato real por
// club, resuelto en tiempo de ejecución — ver Player Contact Principles).
export const MARKETING_WA_URL =
  "https://wa.me/573173672033?text=Hola%2C%20quiero%20conocer%20m%C3%A1s%20sobre%20MiPadelClub%20para%20mi%20club%20de%20p%C3%A1del.";
