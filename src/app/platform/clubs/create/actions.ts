"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { RESERVED_SLUGS } from "@/lib/clubSlugs";

export type CreatePendingClubState = {
  error?: string;
  fieldErrors?: {
    name?: string;
    slug?: string;
  };
};

// Entrega de Club — the SUPERADMIN-only entry point for a club that starts
// fully active with the creating SUPERADMIN as its temporary real OWNER
// (club_members role='OWNER'), pending handoff to its definitive owner via
// a claim link. Deliberately not the same action as onboarding's
// createClub/create_club_with_owner: that path has no concept of a
// pending-claim club, no claim-link bookkeeping, and no controlled
// SUPERADMIN→OWNER transfer step. platform_create_pending_club is the
// separate, narrowly-scoped RPC for this case; see 20261005000001 for the
// full rationale, including the one deliberate, tightly-scoped exception
// to "SUPERADMIN never holds a club_members row" this flow requires.
export async function createPendingClub(
  _prevState: CreatePendingClubState,
  formData: FormData
): Promise<CreatePendingClubState> {
  if (!(await isPlatformAdmin())) {
    redirect("/unauthorized");
  }

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const slug = (formData.get("slug") as string | null)?.trim() ?? "";
  const rawVisibility = formData.get("visibility") as string | null;
  const visibility = rawVisibility === "public" ? "public" : "private";
  // Funnel Comercial — presente solo cuando este form se llegó desde
  // /platform/leads/[leadId] ("Crear club"). Ver PendingClubFields.
  const leadId = (formData.get("leadId") as string | null)?.trim() || null;

  if (!name) {
    return { fieldErrors: { name: "Ingresa el nombre del club." } };
  }
  if (!slug || slug.length < 3) {
    return { fieldErrors: { slug: "Usa al menos 3 caracteres." } };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { fieldErrors: { slug: "Ese identificador está reservado. Elige otro." } };
  }

  const supabase = await createClient();

  // Con lead: platform_convert_lead_to_pending_club envuelve
  // platform_create_pending_club (nunca reimplementa su lógica) y, en la
  // misma transacción, marca el lead como convertido — ver
  // 20261115000001_commercial_leads_funnel.sql. Sin lead: el flujo
  // original, sin cambios.
  const { data, error } = leadId
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- platform_convert_lead_to_pending_club added in 20261115000001, not yet in generated types.
      await (supabase.rpc as any)("platform_convert_lead_to_pending_club", {
        p_lead_id: leadId,
        p_name: name,
        p_slug: slug,
        p_visibility: visibility,
      })
    : await supabase.rpc("platform_create_pending_club", {
        p_name: name,
        p_slug: slug,
        p_visibility: visibility,
      });

  if (error) {
    if (error.message.includes("clubs_slug_key") || error.message.includes("duplicate key")) {
      return { fieldErrors: { slug: "Ese identificador ya está en uso." } };
    }
    if (error.message.includes("clubs_slug_format")) {
      return { fieldErrors: { slug: "Solo letras minúsculas, números y guiones." } };
    }
    if (error.message.includes("already_converted")) {
      return { error: "Este prospecto ya fue convertido a un club." };
    }
    return { error: "No se pudo crear el club. Intenta de nuevo." };
  }

  const club = data?.[0];
  if (!club) {
    return { error: "No se pudo crear el club. Intenta de nuevo." };
  }

  redirect(`/platform/clubs/${club.id}`);
}
