"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platformAdmin";

type ActionResult = { error?: string };

export async function updateCommercialSettings(input: {
  baseMonthlyPrice: number;
  promoEnabled: boolean;
  promoMonthlyPrice: number | null;
  trialDays: number;
}): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return { error: "Sin permiso." };

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
  });

  if (error) {
    return { error: "No se pudo guardar la configuración. Intenta de nuevo." };
  }

  revalidatePath("/platform/settings");
  return {};
}
