import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clubHubPath } from "@/lib/clubHubPaths";

interface TeamPageProps {
  params: Promise<{ club: string }>;
}

// Equipo se movió al hub "Club" (vista "Equipo", OWNER-only) — ver
// CLAUDE.md, bloque de reorganización #2. A diferencia de las otras tres
// rutas históricas (redirect incondicional, la revalidación vive en el
// hub), esta conserva su propio chequeo de rol: ADMIN nunca tuvo acceso a
// Equipo (ni siquiera de lectura), así que redirigirlo ciegamente al hub
// filtraría por primera vez esa vista hacia una capacidad prohibida. Se
// mantiene exactamente el mismo destino que ya usaba esta página para un
// rol insuficiente — `/${slug}` — en vez de inventar una redirección nueva.
export default async function TeamPage({ params }: TeamPageProps) {
  const { club: slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: club } = await supabase
    .from("clubs")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

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

  redirect(clubHubPath(slug, "equipo"));
}
