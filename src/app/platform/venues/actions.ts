"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { RESERVED_SLUGS } from "@/lib/clubSlugs";
import { getBogotaNow } from "@/lib/utils/bogotaDatetime";
import {
  normalizeColombianPhone,
  parseVenueForm,
  platformConvertPadelVenueToPendingClub,
  platformDeletePadelVenueDraft,
  platformFindVenueDuplicates,
  platformLinkPadelVenueClub,
  platformSavePadelVenue,
  platformSetPadelVenueStatus,
  venueErrorMessage,
  type PadelVenueAdmin,
  type PadelVenueFormValues,
  type PadelVenueStatus,
  type VenueDuplicates,
} from "@/lib/directory";

// Server Actions del directorio (SUPERADMIN). La autorización real está en
// cada RPC (profiles.is_platform_admin, 42501 para cualquier otro); el
// chequeo aquí solo evita llamadas inútiles y redirige igual que el resto
// de /platform. Nunca service role.

export type VenueActionResult<T = PadelVenueAdmin> = { ok: true; data: T } | { ok: false; error: string };

async function requireAdmin() {
  if (!(await isPlatformAdmin())) redirect("/unauthorized");
  return createClient();
}

function revalidateVenue(id?: string) {
  revalidatePath("/platform/venues");
  if (id) revalidatePath(`/platform/venues/${id}`);
  revalidatePath("/clubs");
}

export async function saveVenueAction(venueId: string | null, values: PadelVenueFormValues): Promise<VenueActionResult> {
  const parsed = parseVenueForm(values, getBogotaNow().dateStr);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const supabase = await requireAdmin();
  const { data, error } = await platformSavePadelVenue(supabase, venueId, parsed.input);
  if (error) return { ok: false, error: venueErrorMessage(error) };
  revalidateVenue(data.id);
  return { ok: true, data };
}

export async function findVenueDuplicatesAction(
  values: Pick<PadelVenueFormValues, "name" | "department" | "municipality" | "address" | "phone" | "whatsapp">,
  excludeId: string | null
): Promise<VenueDuplicates> {
  if (values.name.trim().length < 2 || values.municipality.trim().length < 2) return { venues: [], clubs: [] };
  const supabase = await requireAdmin();
  const phone = normalizeColombianPhone(values.phone);
  const whatsapp = normalizeColombianPhone(values.whatsapp);
  const { data } = await platformFindVenueDuplicates(supabase, {
    name: values.name,
    department: values.department,
    municipality: values.municipality,
    address: values.address || null,
    phone: phone === "invalid" ? null : phone,
    whatsapp: whatsapp === "invalid" ? null : whatsapp,
    excludeId,
  });
  return data ?? { venues: [], clubs: [] };
}

export async function setVenueStatusAction(venueId: string, status: PadelVenueStatus): Promise<VenueActionResult> {
  const supabase = await requireAdmin();
  const { data, error } = await platformSetPadelVenueStatus(supabase, venueId, status);
  if (error) return { ok: false, error: venueErrorMessage(error) };
  revalidateVenue(venueId);
  return { ok: true, data };
}

export async function linkVenueClubAction(venueId: string, clubId: string | null): Promise<VenueActionResult> {
  const supabase = await requireAdmin();
  const { data, error } = await platformLinkPadelVenueClub(supabase, venueId, clubId);
  if (error) return { ok: false, error: venueErrorMessage(error) };
  revalidateVenue(venueId);
  return { ok: true, data };
}

export async function convertVenueToPendingClubAction(
  venueId: string,
  input: { name: string; slug: string; visibility: "public" | "private" }
): Promise<VenueActionResult<{ id: string; slug: string }>> {
  const name = input.name.trim();
  const slug = input.slug.trim();
  if (!name) return { ok: false, error: "Ingresa el nombre del club." };
  if (slug.length < 3) return { ok: false, error: "El identificador necesita al menos 3 caracteres." };
  if (!/^[a-z0-9-]+$/.test(slug)) return { ok: false, error: "Identificador: solo letras minúsculas, números y guiones." };
  if (RESERVED_SLUGS.has(slug)) return { ok: false, error: "Ese identificador está reservado. Elige otro." };

  const supabase = await requireAdmin();
  const { data, error } = await platformConvertPadelVenueToPendingClub(supabase, venueId, {
    name,
    slug,
    visibility: input.visibility === "public" ? "public" : "private",
  });
  if (error) return { ok: false, error: venueErrorMessage(error) };
  revalidateVenue(venueId);
  revalidatePath("/platform/clubs");
  return { ok: true, data };
}

export async function deleteVenueDraftAction(venueId: string): Promise<VenueActionResult<true>> {
  const supabase = await requireAdmin();
  const { error } = await platformDeletePadelVenueDraft(supabase, venueId);
  if (error) return { ok: false, error: venueErrorMessage(error) };
  revalidateVenue();
  return { ok: true, data: true };
}
