import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveClubAccess } from "@/lib/clubAccess";
import { clubHubPath } from "@/lib/clubHubPaths";

interface SettingsPageProps {
  params: Promise<{ club: string }>;
}

// Configuración del club se movió al hub "Club" (vista "Configuración") —
// ver CLAUDE.md, bloque de reorganización #2. Disponible para OWNER y ADMIN
// (Ubicación, Operación, Tarifas, Categoría de jugadores son configuración
// operativa que ambos roles gestionan — solo "Archivar club" dentro del hub
// queda exclusiva de OWNER); un PLAYER u otro rol no autorizado visitando
// esta URL legacy directamente se redirige a `/${slug}` en su lugar, nunca
// al hub ciegamente.
export default async function SettingsPage({ params }: SettingsPageProps) {
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

  const access = await resolveClubAccess(supabase, club.id);
  if (!access.authorized) redirect("/unauthorized");
  if (!["OWNER", "ADMIN"].includes(access.role)) redirect(`/${slug}`);

  redirect(clubHubPath(slug, "configuracion"));
}
