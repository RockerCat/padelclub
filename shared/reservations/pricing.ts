// Fuente única para resolver el precio de una reserva. Portado de
// src/lib/reservationPricing.ts (app web) — antes mobile tenía una
// segunda copia manual de este mismo algoritmo; esta es ahora la única
// implementación real, sin dependencias server-only (solo supabase-js +
// timeToMinutes), importable desde Server Components/Actions (web) y
// directamente desde mobile por igual.
//
// Precio fijo por duración: una tarifa (club_pricing_rules) decide QUÉ
// franja aplica (club/cancha/días/horas), y club_pricing_rule_prices
// guarda el monto exacto para cada duración que esa franja ofrece — nunca
// un cálculo proporcional price_per_hour × (duración/60).
// club_pricing_rules.price_per_hour es legado y nunca se lee aquí.
//
// El frontend nunca es la fuente de verdad de un precio: ningún caller
// puede pasar un precio/tarifa/moneda/id de regla a una mutación y que se
// confíe en él — toda integración debe volver a llamar
// resolveReservationPrice server-side (o, en mobile, contra RLS), igual
// que la validación de horario/solapamiento siempre se revalida en cada
// escritura en vez de confiar en el estado del cliente.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { timeToMinutes } from "./operatingHours";

export type PricingRule = {
  id: string;
  club_id: string;
  court_id: string | null;
  name: string;
  days_of_week: number[];
  start_time: string; // "HH:MM:SS"
  end_time: string; // "HH:MM:SS"; "00:00:00" significa fin de día (24:00)
  display_order: number;
  is_active: boolean;
};

export type PricingRulePriceRow = {
  duration_minutes: number;
  price_amount: number;
  currency: string;
};

export type ResolveReservationPriceInput = {
  clubId: string;
  courtId: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM" o "HH:MM:SS"
  durationMinutes: number;
};

// Discriminado por `matched`. "missing_pricing_rule": ninguna regla activa
// cubre este club/cancha/día/hora. "missing_duration_price": se encontró
// una regla, pero no tiene precio configurado para esta duración exacta —
// nunca cae a el precio de otra duración ni al legado price_per_hour.
export type ResolveReservationPriceResult =
  | {
      matched: true;
      ruleId: string;
      ruleName: string;
      durationMinutes: number;
      priceAmount: number;
      finalPrice: number;
      currency: string;
      calculatedAt: string;
    }
  | {
      matched: false;
      reason: "missing_pricing_rule" | "missing_duration_price";
      ruleId: string | null;
      ruleName: string | null;
      durationMinutes: number;
      priceAmount: null;
      finalPrice: null;
      currency: null;
      calculatedAt: string;
    };

// '00:00:00' como end_time significa "hasta el final del día" (24:00),
// nunca "el inicio del día".
function endTimeToMinutes(endTime: string): number {
  return endTime.slice(0, 5) === "00:00" ? 24 * 60 : timeToMinutes(endTime);
}

// Intervalo semiabierto [start, end) — start inclusive, end exclusivo.
function ruleCoversStart(rule: PricingRule, dayOfWeek: number, startMinutes: number): boolean {
  if (!rule.is_active) return false;
  if (!rule.days_of_week.includes(dayOfWeek)) return false;
  const ruleStart = timeToMinutes(rule.start_time);
  const ruleEnd = endTimeToMinutes(rule.end_time);
  return startMinutes >= ruleStart && startMinutes < ruleEnd;
}

// Los únicos dos niveles de especificidad: una regla específica de cancha
// siempre gana sobre una general (court_id IS NULL) para el mismo
// club/día/hora — nunca se resuelve por recencia ni otro criterio, porque
// el trigger de solapamiento en base de datos ya garantiza que como mucho
// una regla activa por alcance (específica vs. general) puede cubrir el
// mismo día+hora.
export function selectApplicablePricingRule(
  rules: PricingRule[],
  params: { courtId: string; dayOfWeek: number; startMinutes: number }
): PricingRule | null {
  const { courtId, dayOfWeek, startMinutes } = params;
  const candidates = rules.filter((r) => ruleCoversStart(r, dayOfWeek, startMinutes));

  const specific = candidates.find((r) => r.court_id === courtId);
  if (specific) return specific;

  return candidates.find((r) => r.court_id === null) ?? null;
}

// Redondea a 2 decimales — usado por la acción admin de tarifas para
// redondear un input de formulario antes de persistirlo. resolveReservationPrice
// ya no lo necesita (el precio fijo llega limpio desde numeric(10,2)).
export function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

/**
 * Resuelve el precio de una reserva a partir de clubId/courtId/date/
 * startTime/durationMinutes. Lee club_pricing_rules y
 * club_pricing_rule_prices a través del cliente Supabase del caller
 * (acotado por RLS — cualquier miembro activo del club puede leer
 * tarifas), nunca con un bypass de service-role.
 *
 * Nunca lanza para "sin tarifa aplicable" o "sin precio para esta
 * duración" — ambos son resultados normales y explícitos (`matched:
 * false` con un `reason` distinguible, todo campo monetario `null`). Sí
 * lanza para input malformado (fecha/hora con forma inválida, duración no
 * positiva), porque eso es un bug del caller, no un resultado de negocio.
 */
export async function resolveReservationPrice(
  supabase: SupabaseClient<Database>,
  input: ResolveReservationPriceInput
): Promise<ResolveReservationPriceResult> {
  const { clubId, courtId, date, startTime, durationMinutes } = input;

  if (!DATE_RE.test(date)) {
    throw new Error(`resolveReservationPrice: invalid date "${date}", expected YYYY-MM-DD`);
  }
  if (!TIME_RE.test(startTime)) {
    throw new Error(`resolveReservationPrice: invalid startTime "${startTime}", expected HH:MM[:SS]`);
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error(`resolveReservationPrice: invalid durationMinutes "${durationMinutes}"`);
  }

  const calculatedAt = new Date().toISOString();

  const notMatched = (
    reason: "missing_pricing_rule" | "missing_duration_price",
    rule?: { id: string; name: string }
  ): ResolveReservationPriceResult => ({
    matched: false,
    reason,
    ruleId: rule?.id ?? null,
    ruleName: rule?.name ?? null,
    durationMinutes,
    priceAmount: null,
    finalPrice: null,
    currency: null,
    calculatedAt,
  });

  // Misma convención que cualquier otro cómputo de horario en este
  // proyecto: un Date local-naive construido desde el string de fecha
  // plano, día 0=domingo.
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
  const startMinutes = timeToMinutes(startTime);

  const { data: rules, error: rulesError } = await supabase
    .from("club_pricing_rules")
    .select("id, club_id, court_id, name, days_of_week, start_time, end_time, display_order, is_active")
    .eq("club_id", clubId)
    .eq("is_active", true);

  if (rulesError) {
    // Falla abierto a "sin tarifa" (nunca lanza) para que un problema de
    // lectura transitorio nunca bloquee el flujo que eventualmente llama
    // esto — misma convención que getAvailableSlots/
    // getUnreadNotificationCount en el resto del proyecto: log con
    // contexto, retorna un default seguro.
    console.error("[resolveReservationPrice] failed to load pricing rules:", {
      clubId,
      code: rulesError.code,
      message: rulesError.message,
    });
    return notMatched("missing_pricing_rule");
  }

  const rule = selectApplicablePricingRule((rules ?? []) as PricingRule[], {
    courtId,
    dayOfWeek,
    startMinutes,
  });

  if (!rule) return notMatched("missing_pricing_rule");

  const { data: priceRow, error: priceError } = await supabase
    .from("club_pricing_rule_prices")
    .select("duration_minutes, price_amount, currency")
    .eq("pricing_rule_id", rule.id)
    .eq("duration_minutes", durationMinutes)
    .maybeSingle();

  if (priceError) {
    console.error("[resolveReservationPrice] failed to load duration price:", {
      clubId,
      ruleId: rule.id,
      durationMinutes,
      code: priceError.code,
      message: priceError.message,
    });
    return notMatched("missing_duration_price", rule);
  }

  if (!priceRow) return notMatched("missing_duration_price", rule);

  return {
    matched: true,
    ruleId: rule.id,
    ruleName: rule.name,
    durationMinutes,
    priceAmount: priceRow.price_amount,
    finalPrice: priceRow.price_amount,
    currency: priceRow.currency,
    calculatedAt,
  };
}
