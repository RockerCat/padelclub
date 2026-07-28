#!/usr/bin/env npx tsx
/**
 * LOCAL/TEST ONLY — Backfill de WhatsApp de prueba para jugadores existentes
 *
 * Asigna el número de prueba 573173672033 a todo profile con
 * account_type = 'PLAYER' cuyo phone esté vacío (NULL o "") — nunca
 * sobrescribe un teléfono ya guardado. Opera sobre public.profiles
 * directamente (nunca club_members), así que cada profile se actualiza
 * una sola vez sin importar cuántas membresías tenga, y cubre tanto
 * membresías activas como inactivas (account_type vive en profiles, es
 * independiente del estado de cada club_members).
 *
 * Este número NO debe llegar nunca a una migración de Supabase ni
 * ejecutarse en producción — por eso es un script separado, no una
 * migración, con el mismo candado de entorno ya usado por
 * scripts/seed-reservations.ts.
 *
 * Uso:
 *   npm run backfill:local-phones            — solo reporta (dry run)
 *   npm run backfill:local-phones -- --apply — aplica el UPDATE
 *
 * Requiere:
 *   SUPABASE_SERVICE_ROLE_KEY en .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// ─── Load .env.local ──────────────────────────────────────────────────────────

function loadEnvFile() {
  try {
    const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // No .env.local — rely on existing process env
  }
}

loadEnvFile();

// ─── Safety checks ────────────────────────────────────────────────────────────
// Mismo candado que seed-reservations.ts — este script escribe un número de
// prueba fijo, nunca debe correr contra un entorno de producción real.

if (
  process.env.NODE_ENV === "production" &&
  process.env.ALLOW_DEV_SEED !== "true"
) {
  console.error("❌  Abortado: este backfill es LOCAL/TEST ONLY, no para producción.");
  console.error("    Para forzarlo (no recomendado), agrega ALLOW_DEV_SEED=true al entorno.");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌  Faltan variables de entorno. Agrega a .env.local:");
  if (!SUPABASE_URL) console.error("    NEXT_PUBLIC_SUPABASE_URL=...");
  if (!SERVICE_ROLE_KEY)
    console.error("    SUPABASE_SERVICE_ROLE_KEY=...  (obtener en Supabase Dashboard → Project Settings → API)");
  process.exit(1);
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TEST_PHONE = "573173672033";
const APPLY = process.argv.includes("--apply");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: players, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .eq("account_type", "PLAYER");

  if (error) {
    console.error("❌  Error al leer profiles:", error.message);
    process.exit(1);
  }

  const all = players ?? [];
  const withPhone = all.filter((p) => p.phone && p.phone.trim() !== "");
  const withoutPhone = all.filter((p) => !p.phone || p.phone.trim() === "");

  console.log(`Perfiles PLAYER encontrados: ${all.length}`);
  console.log(`  Ya tienen teléfono (no se tocan): ${withPhone.length}`);
  console.log(`  Sin teléfono (candidatos a backfill): ${withoutPhone.length}`);

  if (withoutPhone.length === 0) {
    console.log("Nada que hacer — ningún PLAYER sin teléfono.");
    return;
  }

  if (!APPLY) {
    console.log(`\n🔎  DRY RUN — no se escribió nada. ${withoutPhone.length} perfil(es) recibirían ${TEST_PHONE}:`);
    for (const p of withoutPhone) console.log(`    - ${p.id}  ${p.full_name ?? "(sin nombre)"}`);
    console.log("\nEjecuta con --apply para aplicar el cambio.");
    return;
  }

  const ids = withoutPhone.map((p) => p.id);
  const { error: updateError } = await supabase.from("profiles").update({ phone: TEST_PHONE }).in("id", ids);

  if (updateError) {
    console.error("❌  Error al actualizar profiles:", updateError.message);
    process.exit(1);
  }

  console.log(`✅  ${ids.length} perfil(es) actualizados con el teléfono de prueba ${TEST_PHONE}.`);
}

main();
