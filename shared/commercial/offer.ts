// Oferta comercial pública (landing, /demo, FAQ, metadatos SEO).
//
// Nunca hardcodea precio ni duración del trial: ambos vienen de
// `get_public_commercial_offer()` (migración 20261115000011), que lee la
// misma fila singleton de `commercial_settings` que `create_pending_payment`
// usa para cobrar e `initialize_club_trial` para fijar el fin del trial —
// así la landing nunca puede prometer un precio o una duración distintos
// de los que el sistema realmente aplica. Este archivo solo da forma a esos
// valores para mostrarlos; la regla de cálculo de fechas vive en SQL
// (`compute_trial_ends_at`), nunca aquí.

export interface PublicCommercialOffer {
  monthlyPrice: number;
  currency: string;
  // Cuando está definido manda sobre trialDays (meses calendario).
  trialMonths: number | null;
  trialDays: number;
}

// Año desde el que aplica la tarifa en la campaña de lanzamiento. Es copy de
// campaña, no una regla de cobro: el cobro real siempre empieza al terminar
// el trial de cada club (y todo trial iniciado desde oct-2026 termina en
// 2027 o después).
export const LAUNCH_PRICING_FROM_YEAR = 2027;

export interface PublicCommercialOfferRow {
  monthly_price: number | string;
  currency: string;
  trial_months: number | null;
  trial_days: number;
}

export function mapPublicCommercialOffer(row: PublicCommercialOfferRow | null | undefined): PublicCommercialOffer | null {
  if (!row) return null;
  const monthlyPrice = Number(row.monthly_price);
  if (!Number.isFinite(monthlyPrice) || !row.currency) return null;
  return {
    monthlyPrice,
    currency: row.currency,
    trialMonths: row.trial_months ?? null,
    trialDays: row.trial_days,
  };
}

// "3 meses" / "1 mes" / "30 días".
export function formatTrialLength(offer: PublicCommercialOffer): string {
  if (offer.trialMonths !== null) {
    return offer.trialMonths === 1 ? "1 mes" : `${offer.trialMonths} meses`;
  }
  return offer.trialDays === 1 ? "1 día" : `${offer.trialDays} días`;
}

// "$99.900 COP" — separador de miles colombiano, sin decimales, igual que el
// resto de montos COP del producto.
export function formatMonthlyPrice(offer: PublicCommercialOffer): string {
  const amount = Math.round(offer.monthlyPrice).toLocaleString("es-CO", { maximumFractionDigits: 0 });
  return `$${amount} ${offer.currency}`;
}

// Presentación comercial del hero a partir de `trial_days` únicamente:
// múltiplo positivo de 30 → "N mes(es)", cualquier otro valor → días
// exactos. Solo copy — la duración real del trial sigue siendo la de
// `compute_trial_ends_at` (SQL) y nunca se deriva de este texto.
export function formatTrialDaysAsMonths(trialDays: number): string {
  if (trialDays > 0 && trialDays % 30 === 0) {
    const months = trialDays / 30;
    return months === 1 ? "1 mes" : `${months} meses`;
  }
  return trialDays === 1 ? "1 día" : `${trialDays} días`;
}
