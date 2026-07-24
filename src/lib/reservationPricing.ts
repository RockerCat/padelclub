// Single source of truth for resolving a reservation's price. Server-safe:
// no "use client", no React, no browser APIs — importable from Server
// Components and Server Actions alike (same convention as
// src/lib/courtAvailability.ts).
//
// Fixed price per duration: a pricing rule (club_pricing_rules) decides
// WHICH tariff bucket applies (club/court/days/hours), and
// club_pricing_rule_prices holds the exact amount for each duration that
// bucket offers — never a proportional price_per_hour × (duration/60)
// calculation. club_pricing_rules.price_per_hour is legacy and is never
// read here.
//
// The frontend is never the source of truth for a price: no caller may
// pass a price/rate/currency/rule id into a mutation and have it trusted —
// every future integration must call resolveReservationPrice again
// server-side, exactly like operating-hours/overlap validation is already
// re-checked on every write instead of trusting client state.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { timeToMinutes } from "@/lib/operatingHours";

// ─── Types ────────────────────────────────────────────────────────────────────

// Shape of a club_pricing_rules row as read from Supabase (only the
// columns needed to decide WHICH rule applies — no price fields here
// anymore, those live in PricingRulePriceRow below).
export type PricingRule = {
  id: string;
  club_id: string;
  court_id: string | null;
  name: string;
  days_of_week: number[];
  start_time: string; // "HH:MM:SS"
  end_time: string; // "HH:MM:SS"; "00:00:00" means end-of-day (24:00)
  display_order: number;
  is_active: boolean;
};

// Shape of a club_pricing_rule_prices row.
export type PricingRulePriceRow = {
  duration_minutes: number;
  price_amount: number;
  currency: string;
};

export type ResolveReservationPriceInput = {
  clubId: string;
  courtId: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM" or "HH:MM:SS"
  durationMinutes: number;
};

// Discriminated on `matched`. "missing_pricing_rule": no active rule
// covers this club/court/day/start-time at all. "missing_duration_price":
// a rule was found, but it has no price configured for this exact
// duration — never falls back to a different duration's price or to the
// legacy price_per_hour.
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

// ─── Pure matching logic (unit-testable with plain in-memory fixtures,
// no Supabase, no I/O) ────────────────────────────────────────────────────────

// '00:00:00' as an end_time means "through the end of the day" (24:00),
// never "the start of the day" — see club_pricing_rules_time_range_valid
// in the migration. Any other end_time is used as-is.
function endTimeToMinutes(endTime: string): number {
  return endTime.slice(0, 5) === "00:00" ? 24 * 60 : timeToMinutes(endTime);
}

// Half-open interval membership [start, end) — start inclusive, end
// exclusive, matching the business rule exactly (06:00–18:00 includes
// 17:59, never 18:00).
function ruleCoversStart(rule: PricingRule, dayOfWeek: number, startMinutes: number): boolean {
  if (!rule.is_active) return false;
  if (!rule.days_of_week.includes(dayOfWeek)) return false;
  const ruleStart = timeToMinutes(rule.start_time);
  const ruleEnd = endTimeToMinutes(rule.end_time);
  return startMinutes >= ruleStart && startMinutes < ruleEnd;
}

// The only two levels of specificity in this phase: a court-specific rule
// always wins over a general (court_id IS NULL) one for the same club/day/
// time — never resolved by recency or any other tiebreaker, because the
// database's overlap trigger already guarantees at most one active rule
// per scope (specific vs. general) can ever cover the same day+time, so
// there is nothing left to disambiguate once specificity is applied.
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

// Rounds to 2 decimals — the only float-safe way to persist money without
// a decimal library: never round intermediate values, round once at the
// cent boundary. Not used by resolveReservationPrice itself anymore (the
// fixed price already comes as a clean numeric(10,2) from the database,
// no multiplication happens here) — kept exported and used by the pricing
// admin action to round a raw form input before it's ever persisted.
export function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

// ─── Server-side resolver ─────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

/**
 * Resolves the price of a reservation from clubId/courtId/date/startTime/
 * durationMinutes. Reads club_pricing_rules and club_pricing_rule_prices
 * through the caller's own Supabase client (RLS-scoped — any active club
 * member can read tariffs), never a service-role bypass.
 *
 * Callers are expected to have already validated that courtId belongs to
 * clubId and is active — this function does not re-check that (it isn't a
 * reservation-creation validator, only a price calculator).
 *
 * Never throws for "no applicable tariff" or "no price for this
 * duration" — both are normal, explicit results (`matched: false` with a
 * distinguishable `reason`, every monetary field `null`). It DOES throw
 * for malformed input (invalid date/time shape, non-positive duration),
 * since that is a caller bug, not a business outcome.
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

  // Same convention as every other scheduling computation in this codebase
  // (club_operating_hours, PlayerAvailabilityCalendar, admin/reservations):
  // a local-naive Date built from the plain date string, day 0=domingo.
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
  const startMinutes = timeToMinutes(startTime);

  const { data: rules, error: rulesError } = await supabase
    .from("club_pricing_rules")
    .select("id, club_id, court_id, name, days_of_week, start_time, end_time, display_order, is_active")
    .eq("club_id", clubId)
    .eq("is_active", true);

  if (rulesError) {
    // Fails open to "no tariff" (never throws) so a transient read issue
    // never blocks whatever flow eventually calls this — same convention
    // as getAvailableSlots/getUnreadNotificationCount elsewhere in this
    // codebase: log with context, return a safe default.
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
