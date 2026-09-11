"use server";

import { createClient } from "@/lib/supabase/server";

export interface OwnerClubRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

type OwnerClubQueryRow = {
  clubs: { id: string; name: string; slug: string; logo_url: string | null; archived_at: string | null; is_active: boolean };
};

// Única fuente de los clubes que el OWNER puede administrar, para el modal
// "Cambiar de club" (src/components/layout/ChangeClubModal.tsx) — mismo
// criterio de membresía activa/no archivada/operacionalmente activa que ya
// usan resolveClubEntryPath/resolveActiveMembership (src/lib/utils/
// navigation.ts), acotado además a role === "OWNER": es el único rol que
// puede pertenecer a varios clubes como propietario y el único que ve este
// modal (ADMIN administra exactamente un club de forma permanente — ver
// CLAUDE.md → Role Philosophy). Nunca una segunda fuente de verdad: mismo
// club_members, mismas columnas de clubs ya usadas en el resto de la
// navegación.
//
// Un club con clubs.is_active = false (desactivado por SUPERADMIN — un
// control de plataforma completamente separado de archived_at, ver
// CLAUDE.md → Club Archival Principles) se excluye del mismo modo que uno
// archivado: este modal es exclusivamente un selector de destinos
// administrables ("Selecciona el club que deseas administrar"), sin ningún
// estado visual de "fila no accionable" en su diseño actual, y un club
// desactivado no se puede administrar en absoluto ([club]/layout.tsx
// devuelve ClubDeactivatedScreen sin AppNav, sin selector, para cualquier
// rol) — listarlo aquí solo podía llevar a esa pantalla sin salida. La
// pantalla de "Mis clubes" (/clubs) sigue siendo, sin cambios, el lugar
// donde un miembro puede ver TODOS sus clubes (incluido uno desactivado)
// para revisar su estado.
export async function getOwnerClubs(): Promise<{ clubs: OwnerClubRow[] } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "No se pudo verificar tu sesión." };

  const { data, error } = await supabase
    .from("club_members")
    .select("clubs!inner(id, name, slug, logo_url, archived_at, is_active)")
    .eq("profile_id", user.id)
    .eq("role", "OWNER")
    .eq("is_active", true);

  if (error) return { error: "No se pudieron cargar tus clubes. Intenta de nuevo." };

  const rows = (data ?? []) as unknown as OwnerClubQueryRow[];
  const clubs = rows
    .filter((r) => !r.clubs.archived_at && r.clubs.is_active)
    .map((r) => ({ id: r.clubs.id, name: r.clubs.name, slug: r.clubs.slug, logo_url: r.clubs.logo_url }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { clubs };
}
