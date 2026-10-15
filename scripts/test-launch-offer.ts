// QA — Lanzamiento comercial 2026/2027 (capa TS).
//
// Prueba los formateadores reales de shared/commercial/offer.ts y que
// ningún componente público hardcodee el precio o la duración del trial.
// La regla de fechas (meses calendario, fin de mes, zona horaria) se prueba
// contra SQL real en scripts/test-launch-offer.sql — nunca un espejo en TS.
//
//   npm run test:launch-offer

import { readFileSync } from "fs";
import { join } from "path";
import {
  formatMonthlyPrice,
  formatTrialLength,
  mapPublicCommercialOffer,
  LAUNCH_PRICING_FROM_YEAR,
} from "../shared/commercial/offer";

let passed = 0;
let failed = 0;

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log(`OK   ${label}`);
  } else {
    failed++;
    console.log(`FAIL ${label}\n     esperado: ${JSON.stringify(expected)}\n     obtenido: ${JSON.stringify(actual)}`);
  }
}

// PostgREST devuelve numeric como string en algunos clientes — el mapeo lo
// normaliza.
const offer = mapPublicCommercialOffer({ monthly_price: "99900", currency: "COP", trial_months: 3, trial_days: 30 });
assertEqual(offer, { monthlyPrice: 99900, currency: "COP", trialMonths: 3, trialDays: 30 }, "mapea la fila de get_public_commercial_offer");
assertEqual(offer && formatMonthlyPrice(offer), "$99.900 COP", "precio en formato colombiano");
assertEqual(offer && formatTrialLength(offer), "3 meses", "trial en meses");
assertEqual(formatTrialLength({ monthlyPrice: 1, currency: "COP", trialMonths: 1, trialDays: 30 }), "1 mes", "singular de mes");
assertEqual(formatTrialLength({ monthlyPrice: 1, currency: "COP", trialMonths: null, trialDays: 30 }), "30 días", "respaldo en días");
assertEqual(mapPublicCommercialOffer(null), null, "sin fila → null (la UI omite cifras)");
assertEqual(mapPublicCommercialOffer({ monthly_price: "abc", currency: "COP", trial_months: 3, trial_days: 30 }), null, "precio inválido → null");
assertEqual(LAUNCH_PRICING_FROM_YEAR, 2027, "año de inicio de la tarifa");

// Ningún componente público escribe cifras de la oferta a mano: todas salen
// de commercial_settings vía get_public_commercial_offer().
const root = join(__dirname, "..");
const publicFiles = [
  "src/components/features/marketing/Hero.tsx",
  "src/components/features/marketing/LaunchOffer.tsx",
  "src/components/features/marketing/Faq.tsx",
  "src/components/features/marketing/Audience.tsx",
  "src/app/(marketing)/page.tsx",
  "src/app/(marketing)/demo/page.tsx",
];
for (const f of publicFiles) {
  const src = readFileSync(join(root, f), "utf8");
  assertEqual(/99[.,]?9[09]0|120[.,]?000|\b3 meses\b|\b30 días\b|\b90 días\b/.test(src), false, `${f} no hardcodea precio/duración`);
  assertEqual(/n[uú]mero de tarjeta|\bcvv\b|card ?number/i.test(src), false, `${f} no pide datos de tarjeta`);
  assertEqual(/wompi/i.test(src), false, `${f} no toca Wompi`);
}

// El menú público de registro ya no ofrece ninguna opción de propietario.
const registerMenu = readFileSync(join(root, "src/components/features/marketing/RegisterMenu.tsx"), "utf8");
assertEqual(registerMenu.includes('"/clubs/create"'), false, "RegisterMenu no enlaza a /clubs/create");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
