"use server";

import { createClient } from "@/lib/supabase/server";

export interface OwnerClubRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

type OwnerClubQueryRow = {
  clubs: { id: string; name: string; slug: string; logo_url: string | null; archived_at: string | null };
};

// Única fuente de los clubes que el OWNER puede administrar, para el modal
// "Cambiar de club" (src/components/layout/ChangeClubModal.tsx) — mismo
// criterio de membresía activa/no archivada que ya usan resolveClubEntryPath/
// resolveActiveMembership (src/lib/utils/navigation.ts), acotado además a
// role === "OWNER": es el único rol que puede pertenecer a varios clubes como
// propietario y el único que ve este modal (ADMIN administra exactamente un
// club de forma permanente — ver CLAUDE.md → Role Philosophy). Nunca una
// segunda fuente de verdad: mismo club_members, mismas columnas de clubs ya
// usadas en el resto de la navegación.
export async function getOwnerClubs(): Promise<{ clubs: OwnerClubRow[] } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "No se pudo verificar tu sesión." };

  const { data, error } = await supabase
    .from("club_members")
    .select("clubs!inner(id, name, slug, logo_url, archived_at)")
    .eq("profile_id", user.id)
    .eq("role", "OWNER")
    .eq("is_active", true);

  if (error) return { error: "No se pudieron cargar tus clubes. Intenta de nuevo." };

  const rows = (data ?? []) as unknown as OwnerClubQueryRow[];
  const clubs = rows
    .filter((r) => !r.clubs.archived_at)
    .map((r) => ({ id: r.clubs.id, name: r.clubs.name, slug: r.clubs.slug, logo_url: r.clubs.logo_url }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { clubs };
}
