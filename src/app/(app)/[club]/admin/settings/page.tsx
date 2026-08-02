import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveClubAccess } from "@/lib/clubAccess";
import { clubHubPath } from "@/lib/clubHubPaths";

interface SettingsPageProps {
  params: Promise<{ club: string }>;
}

// Configuración del club se movió al hub "Club" (vista "Configuración",
// ahora OWNER-only) — ver CLAUDE.md, bloque de reorganización #2. A
// diferencia de las otras rutas históricas (redirect incondicional, la
// revalidación vive en el hub), esta conserva su propio chequeo de rol —
// mismo patrón exacto que admin/team/page.tsx para "Equipo": Configuración
// es una capacidad de OWNER, así que un ADMIN visitando esta URL legacy
// directamente nunca debe llegar, ni de rebote, al hub con esa vista — se
// le redirige a `/${slug}` en su lugar, nunca al hub ciegamente.
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
  if (access.role !== "OWNER") redirect(`/${slug}`);

  redirect(clubHubPath(slug, "configuracion"));
}
