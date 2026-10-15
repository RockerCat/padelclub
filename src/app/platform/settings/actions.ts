"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };

export async function updateCommercialSettings(input: {
  baseMonthlyPrice: number;
  promoEnabled: boolean;
  promoMonthlyPrice: number | null;
  trialDays: number;
  trialMonths: number | null;
}): Promise<ActionResult> {
  // La RPC es la autoridad real (gate SUPERADMIN propio, 42501). Aquí solo
  // exigimos sesión: el pre-chequeo `isPlatformAdmin()` leía get_my_profile
  // sin revisar `error`, así que una lectura fallida/sesión a medio
  // refrescar se confundía con "no es SUPERADMIN" y devolvía "Sin permiso."
  // a un SUPERADMIN legítimo.
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Inicia sesión de nuevo." };

  // Validación defensiva del lado servidor — nunca confiar únicamente en
  // que el form deshabilite inputs inválidos. La RPC re-valida lo mismo
  // (fuente de verdad real), esto solo evita un roundtrip para errores
  // obvios y da un mensaje más claro que el crudo de Postgres.
  if (!Number.isFinite(input.baseMonthlyPrice) || input.baseMonthlyPrice < 0) {
    return { error: "El precio base debe ser un número mayor o igual a 0." };
  }
  if (!Number.isInteger(input.trialDays) || input.trialDays <= 0) {
    return { error: "Los días de trial deben ser un entero mayor a 0." };
  }
  if (input.trialMonths !== null && (!Number.isInteger(input.trialMonths) || input.trialMonths < 1 || input.trialMonths > 24)) {
    return { error: "Los meses de trial deben ser un entero entre 1 y 24." };
  }
  if (input.promoMonthlyPrice !== null && (!Number.isFinite(input.promoMonthlyPrice) || input.promoMonthlyPrice < 0)) {
    return { error: "El precio promo debe ser un número mayor o igual a 0." };
  }
  if (input.promoEnabled && (input.promoMonthlyPrice === null || input.promoMonthlyPrice > input.baseMonthlyPrice)) {
    return { error: "Con la promo activa, el precio promo es obligatorio y no puede superar el precio base." };
  }

  const supabase = await createClient();
  // update_platform_commercial_settings added in 20261115000009, not yet in
  // generated types until types:generate runs against a DB with this
  // migration applied (bloqueado hoy — ver CLAUDE.md → Types Generation).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("update_platform_commercial_settings", {
    p_base_monthly_price: input.baseMonthlyPrice,
    p_promo_enabled: input.promoEnabled,
    p_promo_monthly_price: input.promoMonthlyPrice,
    p_trial_days: input.trialDays,
    p_trial_months: input.trialMonths,
  });

  if (error) {
    if (error.code === "42501") return { error: "Sin permiso." };
    if (error.code === "PGRST202") {
      return { error: "La base de datos aún no tiene la migración de meses de trial (20261115000011)." };
    }
    return { error: "No se pudo guardar la configuración. Intenta de nuevo." };
  }

  revalidatePath("/platform/settings");
  return {};
}
