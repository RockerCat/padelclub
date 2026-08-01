import { createClient } from "@/lib/supabase/server";
import { PlatformUsersTable, type PlatformUserRow, type PlatformUserMembership } from "./PlatformUsersTable";

export default async function PlatformUsersPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_platform_users_overview");
  // get_platform_users_overview's `memberships` column is jsonb — see the
  // matching comment in [userId]/page.tsx for why `Json` is genuinely
  // correct here and this cast reflects the RPC's real, guaranteed shape.
  const users: PlatformUserRow[] = (data ?? []).map((u) => ({
    ...u,
    memberships: (u.memberships ?? []) as unknown as PlatformUserMembership[],
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <h1 className="text-2xl font-bold text-white mb-1">Usuarios</h1>
      <p className="text-sm text-brand-muted mb-8">
        Todos los usuarios registrados en MiPadelClub. Solo consulta.
      </p>

      {error && (
        <div className="mb-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
          No se pudieron cargar los usuarios ({error.message}).
        </div>
      )}

      <PlatformUsersTable users={users} />
    </div>
  );
}
