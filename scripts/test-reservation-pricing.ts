// Controlled-data validation of the pricing engine's pure matching logic
// (selectApplicablePricingRule + roundToCents) — no Supabase, no mocks of
// application behavior, just plain in-memory fixtures. Run with:
//
//   npx tsx scripts/test-reservation-pricing.ts
//
// This covers every scenario from the pricing architecture task except
// "Solapamiento" (rejecting two overlapping active rules), which is a
// database-trigger guarantee (check_pricing_rule_overlap in
// 20260802000001_club_pricing_rules.sql) and can only be verified once
// that migration is applied to a real Postgres instance — see the task
// response for why that step could not be executed from this environment.

import { selectApplicablePricingRule, roundToCents } from "../src/lib/reservationPricing";
import type { PricingRule } from "../src/lib/reservationPricing";

let passed = 0;
let failed = 0;

function assertEqual<T>(actual: T, expected: T, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`OK   ${label}`);
  } else {
    failed++;
    console.error(`FAIL ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function mkRule(
  fields: Pick<PricingRule, "id" | "name" | "days_of_week" | "start_time" | "end_time"> & Partial<PricingRule>
): PricingRule {
  return {
    club_id: "test-club",
    court_id: null,
    display_order: 0,
    is_active: true,
    ...fields,
  };
}

function timeToMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// ─── Fixtures: the exact diurna/nocturna example from the business rule ──────

const DIURNA = mkRule({
  id: "diurna",
  name: "Tarifa diurna",
  days_of_week: [1, 2, 3, 4, 5],
  start_time: "06:00:00",
  end_time: "18:00:00",
});

const NOCTURNA = mkRule({
  id: "nocturna",
  name: "Tarifa nocturna",
  days_of_week: [1, 2, 3, 4, 5],
  start_time: "18:00:00",
  end_time: "00:00:00", // end-of-day
});

// ─── 1. Tarifa general ────────────────────────────────────────────────────────
assertEqual(
  selectApplicablePricingRule([DIURNA, NOCTURNA], { courtId: "courtA", dayOfWeek: 1, startMinutes: timeToMins("10:00") })?.id,
  "diurna",
  "Tarifa general: lunes 10:00 -> diurna"
);

// ─── 2. Tarifa nocturna, inicio exacto 18:00 (diurna NO debe aplicar) ─────────
assertEqual(
  selectApplicablePricingRule([DIURNA, NOCTURNA], { courtId: "courtA", dayOfWeek: 1, startMinutes: timeToMins("18:00") })?.id,
  "nocturna",
  "Tarifa nocturna: lunes 18:00 exacto -> nocturna, no diurna (fin exclusivo)"
);

// ─── 3. Hora anterior al límite: 17:30, la reserva cruza las 18:00, sigue diurna ──
assertEqual(
  selectApplicablePricingRule([DIURNA, NOCTURNA], { courtId: "courtA", dayOfWeek: 1, startMinutes: timeToMins("17:30") })?.id,
  "diurna",
  "Hora antes del límite: lunes 17:30 (termina 19:00) -> diurna completa, sin prorrateo"
);

// ─── 4. roundToCents ────────────────────────────────────────────────────────
// Fixed per-duration prices (club_pricing_rule_prices) are no longer derived
// by any duration/60 multiplication — the "duraciones" scenario from the
// old proportional model doesn't apply anymore. roundToCents itself is
// still exported and used by the pricing admin action (parsePrices in
// admin/settings/actions.ts) to round a raw form input before persisting,
// so it's still worth covering directly here.
assertEqual(roundToCents(70000), 70000, "roundToCents: entero se mantiene igual");
assertEqual(roundToCents(70000.006), 70000.01, "roundToCents: redondea al centavo más cercano");
assertEqual(roundToCents(70000.004), 70000, "roundToCents: redondea hacia abajo si el tercer decimal < 5");

// ─── 5. Regla específica de cancha prevalece sobre general ───────────────────
{
  const general = mkRule({ id: "general-5", name: "General sábado", days_of_week: [6], start_time: "08:00:00", end_time: "12:00:00" });
  const specific = mkRule({ id: "specific-5", name: "Cancha 1 sábado", court_id: "courtA", days_of_week: [6], start_time: "08:00:00", end_time: "12:00:00" });
  assertEqual(
    selectApplicablePricingRule([general, specific], { courtId: "courtA", dayOfWeek: 6, startMinutes: timeToMins("09:00") })?.id,
    "specific-5",
    "Regla específica de cancha prevalece sobre la general (misma cancha, mismo día/hora)"
  );
}

// ─── 6. Otra cancha (sin regla propia) -> aplica la general ──────────────────
{
  const general = mkRule({ id: "general-6", name: "General sábado", days_of_week: [6], start_time: "08:00:00", end_time: "12:00:00" });
  const specific = mkRule({ id: "specific-6", name: "Cancha 1 sábado", court_id: "courtA", days_of_week: [6], start_time: "08:00:00", end_time: "12:00:00" });
  assertEqual(
    selectApplicablePricingRule([general, specific], { courtId: "courtB", dayOfWeek: 6, startMinutes: timeToMins("09:00") })?.id,
    "general-6",
    "Otra cancha sin regla propia -> aplica la regla general del club"
  );
}

// ─── 7. Fin de semana — days_of_week = {0,6} ──────────────────────────────────
{
  const weekend = mkRule({ id: "weekend", name: "Fin de semana", days_of_week: [0, 6], start_time: "08:00:00", end_time: "18:00:00" });
  assertEqual(
    selectApplicablePricingRule([weekend], { courtId: "courtA", dayOfWeek: 6, startMinutes: timeToMins("10:00") })?.id,
    "weekend",
    "Fin de semana: sábado (6) aplica"
  );
  assertEqual(
    selectApplicablePricingRule([weekend], { courtId: "courtA", dayOfWeek: 0, startMinutes: timeToMins("10:00") })?.id,
    "weekend",
    "Fin de semana: domingo (0) aplica"
  );
  assertEqual(
    selectApplicablePricingRule([weekend], { courtId: "courtA", dayOfWeek: 1, startMinutes: timeToMins("10:00") }),
    null,
    "Fin de semana: lunes (1) NO aplica"
  );
}

// ─── 8. Sin tarifa aplicable ───────────────────────────────────────────────────
assertEqual(
  selectApplicablePricingRule([DIURNA, NOCTURNA], { courtId: "courtA", dayOfWeek: 0, startMinutes: timeToMins("10:00") }),
  null,
  "Sin tarifa: domingo sin reglas configuradas (DIURNA/NOCTURNA son solo lun-vie) -> null (matched=false)"
);

// ─── Extra: medianoche como fin de día, no como inicio ────────────────────────
assertEqual(
  selectApplicablePricingRule([NOCTURNA], { courtId: "courtA", dayOfWeek: 1, startMinutes: timeToMins("23:59") })?.id,
  "nocturna",
  "23:59 lunes -> nocturna (00:00 se interpreta como 24:00, no como inicio de día)"
);
assertEqual(
  selectApplicablePricingRule([NOCTURNA], { courtId: "courtA", dayOfWeek: 1, startMinutes: timeToMins("00:00") }),
  null,
  "00:00 lunes -> NOCTURNA (18:00-00:00) no cubre el inicio del día siguiente, ninguna franja de este fixture aplica"
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
