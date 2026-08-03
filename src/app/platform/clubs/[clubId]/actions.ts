"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { generateClaimToken, hashClaimToken } from "@/lib/clubClaim";
import { SLUG_REGEX, RESERVED_SLUGS } from "@/lib/clubSlugs";

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

// SUPERADMIN-only. Changes only clubs.slug — never owner, membership,
// configuration, is_active or archived_at, and never club_id itself.
// Reuses the exact same format/reserved/availability rules as club
// creation (SLUG_REGEX/RESERVED_SLUGS from src/lib/clubSlugs.ts, the same
// source createClub/createPendingClub already validate against) — never a
// second copy of that logic. The old slug is never redirected anywhere:
// it becomes immediately available for reuse the moment this succeeds,
// same as platform_update_club_slug's own availability check plus the
// pre-existing clubs_slug_key UNIQUE constraint guarantee under a race.
export async function updateClubSlug(
  clubId: string,
  newSlug: string
): Promise<ActionResult<{ slug?: string }>> {
  const gate = await requirePlatformAdmin();
  if (gate.error) return { error: gate.error };

  const slug = newSlug.trim().toLowerCase();

  if (!slug || slug.length < 3) {
    return { error: "Usa al menos 3 caracteres." };
  }
  if (!SLUG_REGEX.test(slug)) {
    return { error: "Solo letras minúsculas, números y guiones." };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { error: "Ese identificador está reservado. Elige otro." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_update_club_slug", {
    p_club_id: clubId,
    p_new_slug: slug,
  });

  if (error) {
    if (
      error.code === "23505" ||
      error.message.includes("clubs_slug_key") ||
      error.message.includes("duplicate key") ||
      error.message.includes("already in use")
    ) {
      return { error: "Ese identificador ya está en uso." };
    }
    if (error.message.includes("clubs_slug_format")) {
      return { error: "Solo letras minúsculas, números y guiones." };
    }
    if (error.code === "22023") {
      return { error: "Ingresa un identificador distinto al actual." };
    }
    if (error.code === "P0002") return { error: "El club no existe." };
    return { error: "No se pudo cambiar el identificador. Intenta de nuevo." };
  }

  const club = data?.[0];
  revalidatePath(`/platform/clubs/${clubId}`);
  return { slug: club?.slug };
}
