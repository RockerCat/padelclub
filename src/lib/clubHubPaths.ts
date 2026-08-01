// Único lugar que conoce la URL del hub administrativo "Club" (Perfil
// público, Noticias, Equipo, Configuración) — nunca construida a mano en
// otros componentes/acciones. Mismo patrón que newsPaths.ts.
export type ClubHubTabKey = "perfil_publico" | "noticias" | "equipo" | "configuracion";

export function clubHubPath(clubSlug: string, tab?: ClubHubTabKey): string {
  const base = `/${clubSlug}/admin/club`;
  return tab && tab !== "perfil_publico" ? `${base}?tab=${tab}` : base;
}
