import { redirect } from "next/navigation";
import { clubHubPath } from "@/lib/clubHubPaths";

interface SettingsPageProps {
  params: Promise<{ club: string }>;
}

// Configuración del club se movió al hub "Club" (vista "Configuración") —
// ver CLAUDE.md, bloque de reorganización #2. Session/club/membership/rol
// (incluida la restricción OWNER/ADMIN de qué módulos son editables) se
// revalidan en el propio hub, así que no se duplica esa lógica aquí.
export default async function SettingsPage({ params }: SettingsPageProps) {
  const { club: slug } = await params;
  redirect(clubHubPath(slug, "configuracion"));
}
