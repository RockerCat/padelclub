import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./SettingsForm";

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

  // Fetch the club + membership in one go
  const { data: membership } = await supabase
    .from("club_members")
    .select("role, clubs!inner(*)")
    .eq("clubs.slug", slug)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) {
    notFound();
  }

  // Only OWNER can access settings
  if (membership.role !== "OWNER") {
    redirect(`/${slug}`);
  }

  const club = membership.clubs as unknown as import("@/types/database").Club;

  return (
    <div className="p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Configuración del club</h1>
        <p className="text-brand-muted mt-1 text-sm">
          Actualiza la información y apariencia de tu club.
        </p>
      </div>

      <SettingsForm club={club} />
    </div>
  );
}
