import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./SettingsForm";
import type { Club } from "@/types/database";

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

  console.log("[user]", user?.id);
  console.log("[club lookup]", slug);

  // Step 1: resolve slug → full club row (needed for the settings form)
  const result = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  console.log("[club result]", result);
  console.log("[club data]", result.data);
  console.log("[club error]", result.error);

  const club = result.data;

  if (!club) {
    notFound();
  }

  // Step 2: verify the user is OWNER of this club
  const { data: membership } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", club.id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  console.log("[membership]", membership);

  if (!membership) {
    redirect("/unauthorized");
  }

  if (membership.role !== "OWNER") {
    redirect(`/${slug}`);
  }

  return (
    <div className="p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Configuración del club</h1>
        <p className="text-brand-muted mt-1 text-sm">
          Actualiza la información y apariencia de tu club.
        </p>
      </div>
      <SettingsForm club={club as Club} />
    </div>
  );
}
