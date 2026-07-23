"use server";

import { createClient } from "@/lib/supabase/server";
import { cancelPendingJoinRequestsForPublicClub } from "@/lib/joinRequests";

export type OnboardingActionState = { success?: boolean; error?: string };

// Named requireOwner for its original onboarding context (only ever run
// by the club's OWNER, right after creation), but also backs Página
// Pública's reuse of these same steps (PublicProfileModal, LocationModal)
// — so ADMIN is allowed too. No practical change for onboarding itself:
// a brand-new club has no ADMIN yet when this flow runs.
async function requireOwner(clubId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { supabase: null, error: "No autenticado." };

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership || !["OWNER", "ADMIN"].includes(membership.role))
    return { supabase: null, error: "No tienes permiso para editar este club." };

  return { supabase, error: null };
}

// Paso 1 — description + visibility only.
// Name is edited inline in the Club Hero. Logo and cover are uploaded via the
// Hero upload buttons. None of those fields are touched here.
export async function updateClubIdentity(
  clubId: string,
  _prevState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  const { supabase, error: authError } = await requireOwner(clubId);
  if (authError || !supabase) return { error: authError! };

  const description = (formData.get("description") as string | null)?.trim() || null;
  const rawVisibility = formData.get("visibility") as string | null;
  const visibility = rawVisibility === "private" ? "private" : "public";

  const { error } = await supabase
    .from("clubs")
    .update({ description, visibility })
    .eq("id", clubId);

  if (error) return { error: "Error al guardar. Intenta de nuevo." };

  // Same cleanup as the Settings page's updateClubVisibility — a public club no
  // longer gates access through join requests.
  if (visibility === "public") {
    await cancelPendingJoinRequestsForPublicClub(supabase, clubId);
  }

  return { success: true };
}

// Paso 2 — location fields only.
export async function updateClubLocation(
  clubId: string,
  _prevState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  const { supabase, error: authError } = await requireOwner(clubId);
  if (authError || !supabase) return { error: authError! };

  const city    = (formData.get("city")    as string | null)?.trim() || null;
  const state   = (formData.get("state")   as string | null)?.trim() || null;
  const country = (formData.get("country") as string | null)?.trim() || null;
  const address = (formData.get("address") as string | null)?.trim() || null;
  const latRaw  = (formData.get("latitude")  as string | null)?.trim();
  const lngRaw  = (formData.get("longitude") as string | null)?.trim();
  const latitude  = latRaw  ? parseFloat(latRaw)  : null;
  const longitude = lngRaw  ? parseFloat(lngRaw)  : null;

  const { error } = await supabase
    .from("clubs")
    .update({ city, state, country, address, latitude, longitude })
    .eq("id", clubId);

  if (error) return { error: "Error al guardar. Intenta de nuevo." };
  return { success: true };
}

// Paso 3 — social/contact fields only.
export async function updateClubSocial(
  clubId: string,
  _prevState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  const { supabase, error: authError } = await requireOwner(clubId);
  if (authError || !supabase) return { error: authError! };

  const whatsapp  = (formData.get("whatsapp")  as string | null)?.trim() || null;
  const instagram = (formData.get("instagram") as string | null)?.trim() || null;
  const facebook  = (formData.get("facebook")  as string | null)?.trim() || null;
  const youtube   = (formData.get("youtube")   as string | null)?.trim() || null;

  const { error } = await supabase
    .from("clubs")
    .update({ whatsapp, instagram, facebook, youtube })
    .eq("id", clubId);

  if (error) return { error: "Error al guardar. Intenta de nuevo." };
  return { success: true };
}
