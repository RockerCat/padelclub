import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Portado de resolveActiveMembership en src/lib/utils/navigation.ts (app
// web) — misma regla exacta de selección de club (membresías activas no
// archivadas; profiles.last_club_id decide entre 2+), mismo fallback a la
// membresía más antigua. A diferencia del original, este slice no lee
// clubs.primary_color/secondary_color: la personalización de color por
// club fue eliminada por decisión de producto (ver CLAUDE.md → Club
// Identity Principles / src/lib/constants/clubTheme.ts) — mobile/src/lib/theme.ts
// ya trae los dos colores fijos que reemplazan esas columnas.
export interface ActiveMembership {
  // club_members.id — el ancla de identidad deportiva (ver CLAUDE.md →
  // Sport / Ranking Module Principles), necesario para el Dashboard
  // deportivo del PLAYER (getUpcomingTournamentActivity). Antes no se
  // seleccionaba porque ninguna pantalla lo necesitaba todavía.
  clubMemberId: string;
  role: string;
  club: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  };
}

type MembershipRow = {
  id: string;
  role: string;
  clubs: ActiveMembership["club"] & { archived_at: string | null };
};

// Una consulta que FALLA (red, o el JWT recién emitido por signIn() todavía
// no propagado a la primera request PostgREST del arranque en frío) nunca
// debe leerse como "el usuario no tiene membresías" — antes, `{ data }`
// descartaba silenciosamente el `error`, así que un fallo transitorio de
// esta única consulta producía el mismo `[]` que un resultado realmente
// vacío, y un PLAYER con una membership activa real quedaba varado en
// NoClubStack (bug real, ver CLAUDE.md/reporte de bug). Un reintento
// inmediato cubre el caso transitorio sin exigir que el usuario recargue
// manualmente; si el segundo intento también falla, el error se propaga de
// verdad — nunca se vuelve a interpretar como "cero membresías".
async function fetchActiveMembershipRows(supabase: SupabaseClient<Database>, userId: string): Promise<MembershipRow[]> {
  const { data, error } = await supabase
    .from("club_members")
    .select("id, role, clubs!inner(id, name, slug, logo_url, archived_at)")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .order("joined_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as MembershipRow[];
}

export async function resolveActiveMembership(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<ActiveMembership | null> {
  let membershipRows: MembershipRow[];
  try {
    membershipRows = await fetchActiveMembershipRows(supabase, userId);
  } catch {
    membershipRows = await fetchActiveMembershipRows(supabase, userId);
  }

  const rows = membershipRows.filter((m) => !m.clubs.archived_at);

  if (rows.length === 0) return null;

  function toResult(row: MembershipRow): ActiveMembership {
    return {
      clubMemberId: row.id,
      role: row.role,
      club: { id: row.clubs.id, name: row.clubs.name, slug: row.clubs.slug, logo_url: row.clubs.logo_url },
    };
  }

  if (rows.length === 1) return toResult(rows[0]);

  const { data: profile } = await supabase.from("profiles").select("last_club_id").eq("id", userId).single();

  const lastClubId = profile?.last_club_id;
  if (lastClubId) {
    const match = rows.find((m) => m.clubs.id === lastClubId);
    if (match) return toResult(match);
  }

  return toResult(rows[0]);
}
