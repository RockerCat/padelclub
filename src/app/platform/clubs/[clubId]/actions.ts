"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { generateClaimToken, hashClaimToken } from "@/lib/clubClaim";

type ActionResult<T extends object = object> = { error?: string } & T;

async function requirePlatformAdmin(): Promise<{ error?: string }> {
  if (!(await isPlatformAdmin())) return { error: "Sin permiso." };
  return {};
}

// Generates a new claim link, atomically revoking any existing pending one
// first (this is also how "Regenerar enlace" works — same action). The raw
// token is returned exactly once here and is never persisted anywhere —
// the caller must show/copy it immediately; there is no way to retrieve it
// again afterward, only to generate a new one.
export async function generateClaimLink(clubId: string): Promise<ActionResult<{ token?: string }>> {
  const gate = await requirePlatformAdmin();
  if (gate.error) return { error: gate.error };

  const token = generateClaimToken();
  const tokenHash = hashClaimToken(token);

  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_generate_club_claim_link", {
    p_club_id: clubId,
    p_token_hash: tokenHash,
  });

  if (error) {
    if (error.message.includes("placeholder OWNER")) {
      return { error: "Este club ya tiene un propietario definitivo — no se puede generar un enlace de entrega." };
    }
    return { error: "No se pudo generar el enlace. Intenta de nuevo." };
  }

  revalidatePath(`/platform/clubs/${clubId}`);
  return { token };
}

export async function revokeClaimLink(clubId: string): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if (gate.error) return { error: gate.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_revoke_club_claim_link", { p_club_id: clubId });

  if (error) {
    return { error: "No se pudo revocar el enlace. Intenta de nuevo." };
  }

  revalidatePath(`/platform/clubs/${clubId}`);
  return {};
}

// Never deletes anything — only flips clubs.is_active to false (plus
// deactivated_at/deactivated_by for audit). Never touches archived_at,
// which stays exclusively the OWNER's own archive_club. See
// reactivateClub below for the counterpart.
export async function deactivateClub(clubId: string): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if (gate.error) return { error: gate.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_deactivate_club", { p_club_id: clubId });

  if (error) {
    return { error: "No se pudo desactivar el club. Intenta de nuevo." };
  }

  revalidatePath(`/platform/clubs/${clubId}`);
  return {};
}

// Counterpart to deactivateClub — only flips clubs.is_active back to true
// (plus reactivated_at/reactivated_by for audit). Never touches
// membership, reservations, tournaments, news, courts, pricing rules or
// claim links; never touches archived_at or the deactivated_at/by history.
export async function reactivateClub(clubId: string): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if (gate.error) return { error: gate.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_reactivate_club", { p_club_id: clubId });

  if (error) {
    if (error.code === "P0002") return { error: "El club no existe." };
    if (error.code === "22023") return { error: "Este club ya está activo." };
    return { error: "No se pudo reactivar el club. Intenta de nuevo." };
  }

  revalidatePath(`/platform/clubs/${clubId}`);
  return {};
}
