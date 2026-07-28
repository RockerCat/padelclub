import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsModules } from "./SettingsModules";
import type { Club } from "@/types/database";
import { DEFAULT_OPERATING_HOURS, type OperatingHour } from "@/lib/operatingHours";
import { getClubDurations } from "@/lib/durations";

interface SettingsPageProps {
  params: Promise<{ club: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { club: slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const result = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  const club = result.data;
  if (!club) notFound();

  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", club.id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) redirect("/unauthorized");
  // Ubicación/Operación stay OWNER-only (SettingsModules hides those cards
  // for ADMIN); ADMIN reaches this page only for the Tarifas summary card —
  // same widening pattern already used for Página Pública
  // (20260726000001_admin_public_page_access.sql).
  if (!["OWNER", "ADMIN"].includes(membership.role)) redirect(`/${slug}`);

  // Fetch configured operating hours, merge with defaults for any missing days
  const { data: dbHours } = await supabase
    .from("club_operating_hours")
    .select("day_of_week, is_open, opens_at, closes_at")
    .eq("club_id", club.id)
    .order("day_of_week");

  // Tarifas: OWNER sees full CRUD, ADMIN sees only the summary card (see
  // SettingsModules) — both need the same real data, RLS already scopes
  // reads to active members regardless of role. Prices now live in the
  // child table (club_pricing_rule_prices), embedded here via a nested
  // select rather than a second round trip.
  const { data: pricingRules } = await supabase
    .from("club_pricing_rules")
    .select(
      "id, club_id, court_id, name, days_of_week, start_time, end_time, display_order, is_active, created_at, updated_at, club_pricing_rule_prices(duration_minutes, price_amount, currency)"
    )
    .eq("club_id", club.id)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  const { data: pricingCourts } = await supabase
    .from("courts")
    .select("id, name")
    .eq("club_id", club.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  // Fase 1 módulo deportivo — catálogo global, fijo, sin scope de club.
  const { data: sportCategories } = await supabase
    .from("sport_categories")
    .select("code, sort_order, created_at")
    .order("sort_order", { ascending: true });

  const mergedHours: OperatingHour[] = DEFAULT_OPERATING_HOURS.map((def) => {
    const found = (dbHours ?? []).find((h) => h.day_of_week === def.day_of_week);
    if (!found) return def;
    return {
      day_of_week: found.day_of_week,
      is_open: found.is_open,
      opens_at: found.opens_at,
      closes_at: found.closes_at,
    };
  });

  return (
    <div className="p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Configuración del club</h1>
        <p className="text-brand-muted mt-1 text-sm">
          Gestiona la ubicación y operación de tu club.
        </p>
      </div>

      <SettingsModules
        club={club as Club}
        clubSlug={slug}
        initialHours={mergedHours}
        role={membership.role as "OWNER" | "ADMIN"}
        pricingRules={pricingRules ?? []}
        pricingCourts={pricingCourts ?? []}
        allowedDurations={getClubDurations(club.allowed_reservation_durations)}
        sportCategories={sportCategories ?? []}
      />
    </div>
  );
}
