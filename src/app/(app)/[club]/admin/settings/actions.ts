"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { DAY_NAMES, validateOperatingHours, type OperatingHour } from "@/lib/operatingHours";
import { DURATION_CATALOG, getClubDurations, durationLabel } from "@/lib/durations";
import { roundToCents } from "@/lib/reservationPricing";
import { clubHubPath } from "@/lib/clubHubPaths";
import { resolveClubAccess } from "@/lib/clubAccess";

export type UpdateAllowedDurationsState = { success?: boolean; error?: string };

/**
 * Called immediately after a cover image is uploaded to Storage (see
 * CoverUploadField) — persists the public URL to clubs.cover_image_url
 * right away, since the Branding modal has no separate "save" step for it.
 */
export async function updateClubCover(
  clubId: string,
  coverUrl: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const access = await resolveClubAccess(supabase, clubId);
  if (!access.authorized || !["OWNER", "ADMIN"].includes(access.role)) {
    return { error: access.authorized ? "No tienes permiso para editar este club." : access.error };
  }

  const { error: updateError } = await supabase
    .from("clubs")
    .update({ cover_image_url: coverUrl || null })
    .eq("id", clubId);

  if (updateError) return { error: updateError.message };
  return {};
}

export async function updateClubLogo(
  clubId: string,
  logoUrl: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const access = await resolveClubAccess(supabase, clubId);
  if (!access.authorized || !["OWNER", "ADMIN"].includes(access.role)) {
    return { error: access.authorized ? "No tienes permiso para editar este club." : access.error };
  }

  const { error: updateError } = await supabase
    .from("clubs")
    .update({ logo_url: logoUrl || null })
    .eq("id", clubId);

  if (updateError) {
    return { error: updateError.message };
  }

  return {};
}

export async function updateClubName(
  clubId: string,
  name: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const access = await resolveClubAccess(supabase, clubId);
  if (!access.authorized || !["OWNER", "ADMIN"].includes(access.role)) {
    return { error: access.authorized ? "No tienes permiso para editar este club." : access.error };
  }

  const trimmed = name.trim();
  if (!trimmed || trimmed.length < 2)
    return { error: "El nombre debe tener al menos 2 caracteres." };

  const { error: updateError } = await supabase
    .from("clubs")
    .update({ name: trimmed })
    .eq("id", clubId);

  if (updateError) return { error: "Error al guardar. Intenta de nuevo." };
  return {};
}

const VALID_DURATION_MINUTES = DURATION_CATALOG.map((d) => d.minutes) as number[];

export async function updateAllowedDurations(
  clubId: string,
  _prevState: UpdateAllowedDurationsState,
  formData: FormData
): Promise<UpdateAllowedDurationsState> {
  const supabase = await createClient();
  const access = await resolveClubAccess(supabase, clubId);
  if (!access.authorized || !["OWNER", "ADMIN"].includes(access.role)) {
    return { error: access.authorized ? "No tienes permiso para modificar la configuración." : access.error };
  }

  const raw = formData.getAll("durations").map((v) => parseInt(v as string, 10));

  if (raw.length === 0) {
    return { error: "Selecciona al menos una duración." };
  }
  if (raw.some((d) => !VALID_DURATION_MINUTES.includes(d))) {
    return { error: "Duración no válida." };
  }
  if (new Set(raw).size !== raw.length) {
    return { error: "No se puede repetir la misma duración." };
  }

  // Any non-empty subset of {60, 90, 120} is valid — no duration is
  // mandatory, none gets special treatment. Sorted before persisting so
  // the stored order is always consistent regardless of submission order.
  const durations = [...raw].sort((a, b) => a - b);

  const { error: updateError } = await supabase
    .from("clubs")
    .update({ allowed_reservation_durations: durations })
    .eq("id", clubId);

  if (updateError) {
    console.error("[updateAllowedDurations]", updateError);
    return { error: "Error al guardar. Intenta de nuevo." };
  }

  return { success: true };
}

// ─── Pricing rules (Tarifas) ──────────────────────────────────────────────────
// Operational configuration, same shared gate as updateAllowedDurations/
// saveOperatingHours above: OWNER and ADMIN, never PLAYER (an ADMIN adjusts
// tarifas by the OWNER's instruction — see CLAUDE.md → Role Philosophy).
// RLS enforces this at the database level too
// (club_pricing_rules_insert_admin/_update_admin, upsert_pricing_rule_with_prices)
// — this app-layer check exists only to return a clear message instead of a
// raw Postgrest permission error.

export type PricingRuleFormState = { success?: boolean; error?: string };

async function requirePricingAdmin(clubId: string) {
  const supabase = await createClient();
  const access = await resolveClubAccess(supabase, clubId);

  if (!access.authorized || !["OWNER", "ADMIN"].includes(access.role)) {
    return { supabase: null, error: access.authorized ? "No tienes permiso para modificar las tarifas." : access.error };
  }

  return { supabase, error: null };
}

function timeToMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function parsePricingForm(formData: FormData) {
  const name = ((formData.get("name") as string | null) ?? "").trim();
  const daysRaw = formData.getAll("days_of_week").map((v) => parseInt(v as string, 10));
  const days_of_week = [...new Set(daysRaw)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  const start_time = ((formData.get("start_time") as string | null) ?? "").trim();
  const end_time = ((formData.get("end_time") as string | null) ?? "").trim();
  const currency = ((formData.get("currency") as string | null) ?? "").trim() || "COP";
  const courtIdRaw = ((formData.get("court_id") as string | null) ?? "").trim();
  const court_id = courtIdRaw === "" ? null : courtIdRaw;
  const display_order = parseInt((formData.get("display_order") as string | null) ?? "0", 10);

  return { name, days_of_week, start_time, end_time, currency, court_id, display_order: Number.isFinite(display_order) ? display_order : 0 };
}

// Mirrors the DB CHECK constraints in club_pricing_rules exactly (same
// bounds, same "00:00 end_time means end-of-day" rule) so a form mistake
// surfaces here with a clear message instead of a raw Postgrest error —
// never a second source of truth for what's "valid", just an earlier,
// friendlier check of the same rules. Price is validated separately by
// parsePrices below — it isn't one of this rule's own scalar fields
// anymore, it's a set of child rows.
function validatePricingForm(f: ReturnType<typeof parsePricingForm>): string | null {
  if (!f.name) return "El nombre es obligatorio.";
  if (f.days_of_week.length === 0) return "Selecciona al menos un día.";
  if (!f.start_time || !f.end_time) return "Selecciona hora de inicio y de fin.";
  const isMidnightEnd = f.end_time.slice(0, 5) === "00:00";
  if (!isMidnightEnd && timeToMins(f.end_time) <= timeToMins(f.start_time)) {
    return "La hora de fin debe ser posterior a la de inicio (usa 00:00 para medianoche).";
  }
  if (!f.currency) return "La moneda es obligatoria.";
  if (f.display_order < 0) return "El orden debe ser mayor o igual a 0.";
  return null;
}

type ParsedPrice = { duration_minutes: number; price_amount: number; currency: string };

// One price field per duration the CLUB currently allows — re-derived
// server-side from clubs.allowed_reservation_durations, never trusted from
// which inputs the client happened to render. Every one of those
// durations is mandatory: a rule can never be saved with a missing price
// for a duration the club offers, and a price submitted for a duration
// the club does NOT currently allow is rejected outright rather than
// silently accepted or dropped.
function parsePrices(formData: FormData, allowedDurations: number[], currency: string): { prices: ParsedPrice[] } | { error: string } {
  const prices: ParsedPrice[] = [];
  for (const minutes of allowedDurations) {
    const raw = formData.get(`price_${minutes}`);
    if (raw === null || raw === "") {
      return { error: `Ingresa el precio para ${durationLabel(minutes)}.` };
    }
    const amount = parseFloat(raw as string);
    if (!Number.isFinite(amount) || amount < 0) {
      return { error: `El precio de ${durationLabel(minutes)} debe ser mayor o igual a 0.` };
    }
    prices.push({ duration_minutes: minutes, price_amount: roundToCents(amount), currency });
  }
  return { prices };
}

// Always logs the real Postgrest/RPC error server-side first — every
// branch below, not only the final fallback — so an unexpected code never
// gets silently swallowed under a friendly message during investigation.
// Never surfaces error.message/details/hint to the client (could leak
// Supabase internals); the client only ever sees one of the fixed strings
// below.
function pricingErrorMessage(error: { code?: string | null; message?: string }): string {
  console.error("[pricingRules]", error);
  if (error.code === "23514") return "Los datos no cumplen las reglas de validación (revisa días, horario o precio).";
  if (error.code === "23P01") return "Esta franja se solapa con una regla activa existente para el mismo alcance y día.";
  if (error.code === "42501") return "No tienes permiso para modificar las tarifas de este club.";
  if (error.code === "P0002") return "La tarifa ya no existe. Actualiza la página e intenta de nuevo.";
  return "Error al guardar la tarifa. Intenta de nuevo.";
}

export async function createPricingRule(
  clubId: string,
  _prevState: PricingRuleFormState,
  formData: FormData
): Promise<PricingRuleFormState> {
  const { supabase, error: authError } = await requirePricingAdmin(clubId);
  if (authError || !supabase) return { error: authError! };

  const parsed = parsePricingForm(formData);
  const validationError = validatePricingForm(parsed);
  if (validationError) return { error: validationError };

  const { data: club } = await supabase.from("clubs").select("allowed_reservation_durations").eq("id", clubId).single();
  const allowedDurations = getClubDurations(club?.allowed_reservation_durations);

  const pricesResult = parsePrices(formData, allowedDurations, parsed.currency);
  if ("error" in pricesResult) return { error: pricesResult.error };

  // SQL acepta NULL para p_rule_id/p_court_id; los tipos generados no lo reflejan.
  //
  // Atomic: rule + all its per-duration prices, or nothing — see
  // upsert_pricing_rule_with_prices (20260803000002).
  const { error: rpcError } = await supabase.rpc("upsert_pricing_rule_with_prices", {
    p_rule_id: (null as string | null) as string,
    p_club_id: clubId,
    p_court_id: parsed.court_id as string,
    p_name: parsed.name,
    p_days_of_week: parsed.days_of_week,
    p_start_time: parsed.start_time.length === 5 ? `${parsed.start_time}:00` : parsed.start_time,
    p_end_time: parsed.end_time.length === 5 ? `${parsed.end_time}:00` : parsed.end_time,
    p_display_order: parsed.display_order,
    p_prices: pricesResult.prices,
  });

  if (rpcError) return { error: pricingErrorMessage(rpcError) };
  return { success: true };
}

export async function updatePricingRule(
  clubId: string,
  ruleId: string,
  _prevState: PricingRuleFormState,
  formData: FormData
): Promise<PricingRuleFormState> {
  const { supabase, error: authError } = await requirePricingAdmin(clubId);
  if (authError || !supabase) return { error: authError! };

  const parsed = parsePricingForm(formData);
  const validationError = validatePricingForm(parsed);
  if (validationError) return { error: validationError };

  const { data: club } = await supabase.from("clubs").select("allowed_reservation_durations").eq("id", clubId).single();
  const allowedDurations = getClubDurations(club?.allowed_reservation_durations);

  const pricesResult = parsePrices(formData, allowedDurations, parsed.currency);
  if ("error" in pricesResult) return { error: pricesResult.error };

  // Atomic: rule update + prices upserted + stale-duration prices removed
  // (the club no longer allows them) — all in one RPC call, never several
  // independent client round trips that could leave a half-saved rule.
  // SQL acepta NULL para p_court_id; el tipo generado no lo refleja.
  const { error: rpcError } = await supabase.rpc("upsert_pricing_rule_with_prices", {
    p_rule_id: ruleId,
    p_club_id: clubId,
    p_court_id: parsed.court_id as string,
    p_name: parsed.name,
    p_days_of_week: parsed.days_of_week,
    p_start_time: parsed.start_time.length === 5 ? `${parsed.start_time}:00` : parsed.start_time,
    p_end_time: parsed.end_time.length === 5 ? `${parsed.end_time}:00` : parsed.end_time,
    p_display_order: parsed.display_order,
    p_prices: pricesResult.prices,
  });

  if (rpcError) return { error: pricingErrorMessage(rpcError) };
  return { success: true };
}

export async function togglePricingRuleActive(
  clubId: string,
  ruleId: string,
  isActive: boolean
): Promise<{ error?: string }> {
  const { supabase, error: authError } = await requirePricingAdmin(clubId);
  if (authError || !supabase) return { error: authError };

  const { error: updateError } = await supabase
    .from("club_pricing_rules")
    .update({ is_active: isActive })
    .eq("id", ruleId)
    .eq("club_id", clubId);

  if (updateError) return { error: pricingErrorMessage(updateError) };
  return {};
}

export async function saveOperatingHours(
  clubId: string,
  hours: OperatingHour[]
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const access = await resolveClubAccess(supabase, clubId);
  if (!access.authorized || !["OWNER", "ADMIN"].includes(access.role)) {
    return { error: access.authorized ? "No tienes permiso para modificar los horarios." : access.error };
  }

  // Validate each day — closes_at must be strictly after opens_at when open
  const dayErrors = validateOperatingHours(hours);
  if (dayErrors.size > 0) {
    const [day, message] = [...dayErrors.entries()][0];
    return { error: `${DAY_NAMES[day]}: ${message}` };
  }

  const rows = hours.map((h) => ({
    club_id: clubId,
    day_of_week: h.day_of_week,
    is_open: h.is_open,
    opens_at: h.is_open ? (h.opens_at ?? null) : null,
    closes_at: h.is_open ? (h.closes_at ?? null) : null,
  }));

  const { error: upsertError } = await supabase
    .from("club_operating_hours")
    .upsert(rows, { onConflict: "club_id,day_of_week" });

  if (upsertError) {
    console.error("[saveOperatingHours] upsert failed:", {
      message: upsertError.message,
      code: upsertError.code,
      details: upsertError.details,
      hint: upsertError.hint,
    });
    return { error: "Error al guardar los horarios. Intenta de nuevo." };
  }

  return { success: true };
}

const MAX_GALLERY_IMAGES = 10;

export async function addGalleryImage(
  clubId: string,
  url: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const access = await resolveClubAccess(supabase, clubId);
  if (!access.authorized || !["OWNER", "ADMIN"].includes(access.role)) {
    return { error: access.authorized ? "No tienes permiso para editar este club." : access.error };
  }

  const { data: club } = await supabase
    .from("clubs")
    .select("gallery_image_urls")
    .eq("id", clubId)
    .single();

  const current = club?.gallery_image_urls ?? [];
  if (current.length >= MAX_GALLERY_IMAGES)
    return { error: `Máximo ${MAX_GALLERY_IMAGES} fotos en la galería.` };

  const { error: updateError } = await supabase
    .from("clubs")
    .update({ gallery_image_urls: [...current, url] })
    .eq("id", clubId);

  if (updateError) return { error: "Error al guardar. Intenta de nuevo." };
  return {};
}

// ─── archiveClub ───────────────────────────────────────────────────────────
// OWNER-only, irreversible-for-now (reactivation is a future phase)
// retirement of the club (see CLAUDE.md → Club Archival Principles). This
// action is only a thin, friendly gate — every real check (auth, active
// OWNER membership, club existence, not-already-archived) and the atomic
// archived_at write + member notification fan-out live inside the
// archive_club RPC (SECURITY DEFINER), which re-derives authorization from
// auth.uid() regardless of what this action already checked.
export async function archiveClub(clubId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: "No autenticado." };

  const { error } = await supabase.rpc("archive_club", { p_club_id: clubId });

  if (error) {
    if (error.code === "42501") return { error: "Solo el propietario puede archivar el club." };
    if (error.code === "22023") return { error: "El club ya fue archivado." };
    if (error.code === "P0002") return { error: "Club no encontrado." };
    return { error: "Error al archivar el club. Intenta nuevamente." };
  }

  return {};
}

export async function removeGalleryImage(
  clubId: string,
  url: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const access = await resolveClubAccess(supabase, clubId);
  if (!access.authorized || !["OWNER", "ADMIN"].includes(access.role)) {
    return { error: access.authorized ? "No tienes permiso para editar este club." : access.error };
  }

  const { data: club } = await supabase
    .from("clubs")
    .select("gallery_image_urls")
    .eq("id", clubId)
    .single();

  const current = club?.gallery_image_urls ?? [];

  const { error: updateError } = await supabase
    .from("clubs")
    .update({ gallery_image_urls: current.filter((u) => u !== url) })
    .eq("id", clubId);

  if (updateError) return { error: "Error al guardar. Intenta de nuevo." };
  return {};
}

// ─── Fase 1 módulo deportivo: categoría predeterminada del club ───────────
// Thin wrapper around configure_club_default_player_category (SECURITY
// DEFINER, 20260821000001) — every real rule (autorización OWNER/ADMIN,
// validación de categoría, aprovisionamiento) lives en Postgres; esta
// acción solo reenvía la llamada y traduce códigos de error, sin duplicar
// ninguna regla de negocio aquí.

export type ConfigureDefaultCategoryState = {
  success?: boolean;
  error?: string;
  provisionedCount?: number;
};

export async function configureDefaultPlayerCategory(
  clubId: string,
  clubSlug: string,
  _prevState: ConfigureDefaultCategoryState,
  formData: FormData
): Promise<ConfigureDefaultCategoryState> {
  const supabase = await createClient();
  const category = formData.get("category");

  if (typeof category !== "string" || category.length === 0) {
    return { error: "Selecciona una categoría." };
  }

  const { data, error } = await supabase.rpc("configure_club_default_player_category", {
    p_club_id: clubId,
    p_category: category,
  });

  if (error) {
    if (error.code === "42501") return { error: "No tienes permiso para configurar este club." };
    if (error.code === "22023") return { error: "Categoría no válida." };
    if (error.code === "P0002") return { error: "Club no encontrado." };
    console.error("[configureDefaultPlayerCategory] RPC failed:", { clubId, category, supabaseError: error });
    return { error: "Error al guardar. Intenta de nuevo." };
  }

  const result = data?.[0];
  revalidatePath(clubHubPath(clubSlug, "configuracion"));
  return { success: true, provisionedCount: result?.provisioned_count ?? 0 };
}
