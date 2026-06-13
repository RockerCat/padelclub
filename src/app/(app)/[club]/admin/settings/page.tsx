import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./SettingsForm";
import { OperatingHoursForm } from "./OperatingHoursForm";
import { AllowedDurationsForm } from "./AllowedDurationsForm";
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
  if (membership.role !== "OWNER") redirect(`/${slug}`);

  // Fetch configured operating hours, merge with defaults for any missing days
  const { data: dbHours } = await supabase
    .from("club_operating_hours")
    .select("day_of_week, is_open, opens_at, closes_at")
    .eq("club_id", club.id)
    .order("day_of_week");

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

  const allowedDurations = getClubDurations((club as Club).allowed_reservation_durations);

  return (
    <div className="p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Configuración del club</h1>
        <p className="text-brand-muted mt-1 text-sm">
          Actualiza la información y apariencia de tu club.
        </p>
      </div>

      <div className="flex flex-col gap-6 max-w-2xl">
        <SettingsForm club={club as Club} />
        <OperatingHoursForm clubId={club.id} initialHours={mergedHours} />
        <AllowedDurationsForm clubId={club.id} initialDurations={allowedDurations} />
      </div>
    </div>
  );
}
