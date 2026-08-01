import { redirect } from "next/navigation";
import { clubHubPath } from "@/lib/clubHubPaths";

interface PublicPagePageProps {
  params: Promise<{ club: string }>;
}

// Página Pública administrativa se movió al hub "Club" (vista "Perfil
// público", la vista por defecto) — ver CLAUDE.md, bloque de reorganización
// #2. Session/club/membership/rol se revalidan en el propio hub, así que no
// se duplica esa lógica aquí. La ruta pública real (/clubs/[slug]) no se
// toca.
export default async function PublicPagePage({ params }: PublicPagePageProps) {
  const { club: slug } = await params;
  redirect(clubHubPath(slug));
}
